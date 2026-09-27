import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { trace } from '@opentelemetry/api';
import {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
    extractTraceContext,
    resolveCallerContext,
    traceToolCall,
} from '../src/telemetry.js';

const exporter = new InMemorySpanExporter();
trace.setGlobalTracerProvider(
    new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
    })
);

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const PARENT_SPAN_ID = 'b7ad6b7169203331';

/** Mimic the tool handler's `extra` for a StreamableHTTP tools/call. */
function extraWithHeaders(headers: Record<string, string>) {
    return { requestInfo: { headers } };
}

async function callTool(extra: any) {
    const result = { content: [{ type: 'text', text: '{"success":true}' }] };
    const returned = await traceToolCall(
        'resolve_and_route',
        resolveCallerContext(extra),
        async () => result,
        extractTraceContext(extra)
    );
    assert.equal(returned, result);
    const spans = exporter.getFinishedSpans();
    assert.equal(spans.length, 1);
    return spans[0];
}

describe('traceToolCall trace context propagation', () => {
    beforeEach(() => exporter.reset());

    it('parents the tool span on a valid traceparent header', async () => {
        const span = await callTool(
            extraWithHeaders({
                traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`,
                tracestate: 'dd=s:1',
            })
        );
        assert.equal(span.name, 'mcp.tool/resolve_and_route');
        assert.equal(span.spanContext().traceId, TRACE_ID);
        assert.equal(span.parentSpanContext?.traceId, TRACE_ID);
        assert.equal(span.parentSpanContext?.spanId, PARENT_SPAN_ID);
        assert.equal(span.parentSpanContext?.isRemote, true);
        assert.notEqual(span.spanContext().spanId, PARENT_SPAN_ID);
    });

    it('starts a root span when there is no traceparent header', async () => {
        const span = await callTool(extraWithHeaders({ 'x-user-id': 'u1' }));
        assert.equal(span.parentSpanContext, undefined);
        assert.notEqual(span.spanContext().traceId, TRACE_ID);
    });

    it('starts a root span when there is no requestInfo (stdio)', async () => {
        const span = await callTool({});
        assert.equal(span.parentSpanContext, undefined);
    });

    it('starts a root span and still succeeds on a malformed traceparent', async () => {
        const span = await callTool(
            extraWithHeaders({ traceparent: 'not-a-traceparent' })
        );
        assert.equal(span.parentSpanContext, undefined);
        assert.equal(span.attributes['mcp.tool.success'], true);
    });

    it('never throws when headers cannot be read', () => {
        const extra = {
            requestInfo: {
                get headers() {
                    throw new Error('boom');
                },
            },
        };
        assert.doesNotThrow(() => extractTraceContext(extra));
    });

    it('passes tool errors through unchanged with a parent context', async () => {
        const extra = extraWithHeaders({
            traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`,
        });
        const error = new Error('tool failed');
        await assert.rejects(
            traceToolCall(
                'resolve_and_route',
                resolveCallerContext(extra),
                async () => {
                    throw error;
                },
                extractTraceContext(extra)
            ),
            (thrown) => thrown === error
        );
        const [span] = exporter.getFinishedSpans();
        assert.equal(span.parentSpanContext?.spanId, PARENT_SPAN_ID);
        assert.equal(span.attributes['mcp.tool.success'], false);
    });
});
