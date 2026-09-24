/**
 * OpenTelemetry tracing + DogStatsD metrics for MCP tool calls.
 *
 * Mirrors the tool telemetry in cbioportal-mcp (src/cbioportal_mcp/telemetry.py)
 * so the navigator can be charted on the same Datadog dashboard ("MCP Tool
 * Metrics" group of the cbioagent dashboard):
 *
 * - DogStatsD metrics (dashboard aggregates):
 *     `<prefix>.tool.calls`        counter
 *     `<prefix>.tool.duration_ms`  distribution (supports p95/p99)
 *     `<prefix>.tool.errors`       counter
 *   Tags: `tool`, `success`, `client_kind`, `client_name`, `service`, `env`.
 *   The prefix defaults to `cbioportal_navigator`.
 *
 * - One OTel span per tool call, named `mcp.tool/<tool>`, exported over
 *   OTLP/HTTP to the Datadog agent. Attributes match cbioportal-mcp:
 *   `mcp.tool.name`, `mcp.tool.duration_ms`, `mcp.tool.success`,
 *   `mcp.client_kind`, `mcp.client.name`, `mcp.client.version`,
 *   `mcp.session.id`, `enduser.id`, `network.client.ip`, `error.type`.
 *
 * Environment variables:
 * - `DD_AGENT_HOST`: Datadog agent host (e.g. node IP via the Downward API).
 *   Enables both tracing and metrics.
 * - `DD_DOGSTATSD_HOST` / `DD_DOGSTATSD_PORT`: DogStatsD endpoint override
 *   (default: `DD_AGENT_HOST`:8125).
 * - `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP/HTTP base URL override
 *   (default: http://`DD_AGENT_HOST`:4318). Enables tracing.
 * - `DD_SERVICE` / `OTEL_SERVICE_NAME`: service name (default: `cbioportal-navigator`).
 * - `DD_ENV`: added as the `env` metric tag and `deployment.environment` resource attribute.
 * - `CBIOPORTAL_NAVIGATOR_DD_METRICS_ENABLED`: set to `false` to disable metrics.
 * - `CBIOPORTAL_NAVIGATOR_DD_METRIC_PREFIX`: metric prefix override.
 *
 * With none of these set (e.g. local stdio use) telemetry is a no-op.
 * Telemetry failures never fail a tool call.
 *
 * @packageDocumentation
 */

import dgram from 'node:dgram';
import { SpanStatusCode, trace, type Tracer } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
    BasicTracerProvider,
    BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

const DEFAULT_SERVICE_NAME = 'cbioportal-navigator';

type TagValue = string | number | boolean | undefined | null;

function envFlag(name: string, defaultValue: boolean): boolean {
    const value = process.env[name];
    if (value === undefined) return defaultValue;
    return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function serviceName(): string {
    return (
        process.env.DD_SERVICE ||
        process.env.OTEL_SERVICE_NAME ||
        DEFAULT_SERVICE_NAME
    );
}

/** Keep DogStatsD tag values low-risk and parseable. */
export function sanitizeTagValue(value: TagValue): string {
    const text = String(value).trim().toLowerCase();
    return text.replace(/[^a-z0-9._\-/]/g, '_') || 'unknown';
}

/**
 * Minimal DogStatsD UDP client.
 *
 * We only need counters and distributions, so speaking the wire protocol
 * avoids adding a dependency for a few metric packets per tool call.
 */
export class DogStatsDClient {
    private readonly socket: dgram.Socket;

    constructor(
        private readonly host: string,
        private readonly port: number,
        private readonly prefix: string,
        private readonly constantTags: Record<string, TagValue> = {}
    ) {
        this.socket = dgram.createSocket('udp4');
        // Don't keep the process alive just for metrics, and never crash on
        // an unreachable agent.
        this.socket.unref();
        this.socket.on('error', () => {});
    }

    increment(metric: string, tags: Record<string, TagValue>): void {
        this.send(metric, 1, 'c', tags);
    }

    distribution(
        metric: string,
        value: number,
        tags: Record<string, TagValue>
    ): void {
        this.send(metric, value, 'd', tags);
    }

    formatPacket(
        metric: string,
        value: number,
        type: string,
        tags: Record<string, TagValue>
    ): string {
        const merged = { ...this.constantTags, ...tags };
        const tagParts = Object.keys(merged)
            .sort()
            .filter((key) => merged[key] !== undefined && merged[key] !== null)
            .map((key) => `${key}:${sanitizeTagValue(merged[key])}`);
        const suffix = tagParts.length ? `|#${tagParts.join(',')}` : '';
        return `${this.prefix.replace(/\.$/, '')}.${metric}:${value}|${type}${suffix}`;
    }

    private send(
        metric: string,
        value: number,
        type: string,
        tags: Record<string, TagValue>
    ): void {
        const packet = this.formatPacket(metric, value, type, tags);
        this.socket.send(packet, this.port, this.host, () => {});
    }
}

let statsd: DogStatsDClient | null = null;
let tracerProvider: BasicTracerProvider | null = null;

function metricsConfigured(): boolean {
    if (!envFlag('CBIOPORTAL_NAVIGATOR_DD_METRICS_ENABLED', true)) return false;
    return Boolean(
        process.env.DD_AGENT_HOST ||
        process.env.DD_DOGSTATSD_HOST ||
        process.env.CBIOPORTAL_NAVIGATOR_DD_METRICS_ENABLED
    );
}

function tracingConfigured(): boolean {
    return Boolean(
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.DD_AGENT_HOST
    );
}

function configureMetrics(): void {
    if (!metricsConfigured()) return;
    const host =
        process.env.DD_DOGSTATSD_HOST ||
        process.env.DD_AGENT_HOST ||
        'localhost';
    const port = parseInt(process.env.DD_DOGSTATSD_PORT || '8125');
    const prefix =
        process.env.CBIOPORTAL_NAVIGATOR_DD_METRIC_PREFIX ||
        'cbioportal_navigator';
    statsd = new DogStatsDClient(host, port, prefix, {
        service: serviceName(),
        env: process.env.DD_ENV,
    });
    console.error(
        `[Telemetry] DogStatsD metrics enabled: ${host}:${port} prefix=${prefix}`
    );
}

function configureTracing(): void {
    if (!tracingConfigured()) return;
    // OTLPTraceExporter only appends /v1/traces when reading the env var
    // itself, so build the full URL when deriving it from DD_AGENT_HOST.
    const url = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        ? undefined
        : `http://${process.env.DD_AGENT_HOST}:4318/v1/traces`;
    const attributes: Record<string, string> = {
        'service.name': serviceName(),
    };
    if (process.env.DD_ENV) {
        attributes['deployment.environment'] = process.env.DD_ENV;
    }
    tracerProvider = new BasicTracerProvider({
        resource: resourceFromAttributes(attributes),
        spanProcessors: [
            new BatchSpanProcessor(new OTLPTraceExporter(url ? { url } : {})),
        ],
    });
    trace.setGlobalTracerProvider(tracerProvider);
    console.error(
        `[Telemetry] OpenTelemetry tracing enabled: service=${serviceName()} endpoint=${url ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`
    );
}

/**
 * Set up metrics and tracing from the environment. Safe to call when nothing
 * is configured; a setup failure is logged and leaves telemetry disabled.
 */
export function configureTelemetry(): void {
    try {
        configureMetrics();
    } catch (error) {
        console.error('[Telemetry] DogStatsD setup failed:', error);
        statsd = null;
    }
    try {
        configureTracing();
    } catch (error) {
        console.error('[Telemetry] OpenTelemetry setup failed:', error);
        tracerProvider = null;
    }
}

/** Flush pending spans; call before process exit. */
export async function shutdownTelemetry(): Promise<void> {
    if (!tracerProvider) return;
    try {
        await tracerProvider.forceFlush();
        await tracerProvider.shutdown();
    } catch (error) {
        console.error('[Telemetry] Shutdown failed:', error);
    } finally {
        tracerProvider = null;
    }
}

/** Who is calling a tool, resolved from the MCP request. */
export interface CallerContext {
    /** "librechat" when the x-user-id header is present, else "direct". */
    clientKind: string;
    userId?: string;
    clientName?: string;
    clientVersion?: string;
    sessionId?: string;
    clientIp?: string;
    userAgent?: string;
}

type Headers = Record<string, string | string[] | undefined>;

function firstHeader(headers: Headers, name: string): string | undefined {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolve caller identity from the tool handler's `extra` argument and the
 * MCP client's initialize handshake, using the same conventions as
 * cbioportal-mcp: LibreChat injects `x-user-id`, everything else is "direct".
 *
 * This server is stateless (a new McpServer per POST), so `clientInfo` from
 * initialize is usually unavailable on tools/call; `userAgent` is recorded
 * on spans as a fallback for telling connectors apart.
 */
export function resolveCallerContext(
    extra: any,
    clientInfo?: { name?: string; version?: string }
): CallerContext {
    const headers: Headers = extra?.requestInfo?.headers ?? {};
    const hasHeaders = extra?.requestInfo !== undefined;
    const userId = firstHeader(headers, 'x-user-id') || undefined;
    const forwardedFor = firstHeader(headers, 'x-forwarded-for');
    return {
        clientKind: !hasHeaders
            ? 'unknown'
            : 'x-user-id' in headers
              ? 'librechat'
              : 'direct',
        userId,
        clientName: clientInfo?.name || undefined,
        clientVersion: clientInfo?.version || undefined,
        sessionId: extra?.sessionId || undefined,
        clientIp: forwardedFor?.split(',')[0]?.trim() || undefined,
        userAgent: firstHeader(headers, 'user-agent') || undefined,
    };
}

function emitToolMetrics(
    toolName: string,
    durationMs: number,
    success: boolean,
    caller: CallerContext
): void {
    if (!statsd) return;
    const tags = {
        tool: toolName,
        success: String(success),
        client_kind: caller.clientKind,
        client_name: caller.clientName,
    };
    try {
        statsd.increment('tool.calls', tags);
        statsd.distribution(
            'tool.duration_ms',
            Math.round(durationMs * 1000) / 1000,
            tags
        );
        if (!success) statsd.increment('tool.errors', tags);
    } catch (error) {
        console.error('[Telemetry] DogStatsD emit failed:', error);
    }
}

function tracer(): Tracer {
    return trace.getTracer('cbioportal-navigator');
}

/**
 * Whether a tool result represents a failure. The navigator's tools catch
 * their own errors and return createErrorResponse() serialized as JSON text
 * (`{"success": false, ...}`) rather than throwing or setting `isError`.
 */
export function isFailedToolResult(result: unknown): boolean {
    const r = result as {
        isError?: boolean;
        content?: Array<{ type?: string; text?: string }>;
    };
    if (r?.isError === true) return true;
    const text = r?.content?.[0]?.type === 'text' ? r.content[0].text : '';
    if (!text?.startsWith('{')) return false;
    try {
        return JSON.parse(text)?.success === false;
    } catch {
        return false;
    }
}

/**
 * Run one tool call inside an `mcp.tool/<tool>` span and emit its metrics.
 *
 * A call counts as failed if the handler throws or returns a failure
 * result (see isFailedToolResult).
 */
export async function traceToolCall<T>(
    toolName: string,
    caller: CallerContext,
    run: () => Promise<T>
): Promise<T> {
    const started = performance.now();
    return tracer().startActiveSpan(`mcp.tool/${toolName}`, async (span) => {
        const attrs: Record<string, string | undefined> = {
            'mcp.tool.name': toolName,
            'mcp.client_kind': caller.clientKind,
            'mcp.client.name': caller.clientName,
            'mcp.client.version': caller.clientVersion,
            'mcp.session.id': caller.sessionId,
            'enduser.id': caller.userId,
            'network.client.ip': caller.clientIp,
            'user_agent.original': caller.userAgent,
        };
        for (const [key, value] of Object.entries(attrs)) {
            if (value) span.setAttribute(key, value);
        }

        const finish = (success: boolean, error?: unknown) => {
            const durationMs = performance.now() - started;
            span.setAttribute('mcp.tool.duration_ms', durationMs);
            span.setAttribute('mcp.tool.success', success);
            if (error !== undefined) {
                span.setAttribute(
                    'error.type',
                    error instanceof Error ? error.name : 'Error'
                );
                if (error instanceof Error) span.recordException(error);
                span.setStatus({ code: SpanStatusCode.ERROR });
            } else if (!success) {
                span.setAttribute('error.type', 'ToolError');
                span.setStatus({ code: SpanStatusCode.ERROR });
            }
            span.end();
            emitToolMetrics(toolName, durationMs, success, caller);
        };

        try {
            const result = await run();
            finish(!isFailedToolResult(result));
            return result;
        } catch (error) {
            finish(false, error);
            throw error;
        }
    });
}
