from app.controller.http.chat_stream_event_mapper import ChatStreamEventMapper
from app.harness.run_event import RunEvent, RunUsage


def test_mapper_preserves_public_sse_json_contract() -> None:
    response = ChatStreamEventMapper.to_response(
        RunEvent(
            type="tool_completed",
            delta="阶段说明",
            model="example-model",
            usage=RunUsage(11, 7, 18),
            active_context_tokens=11,
            error_message="",
            item_id="item-1",
            tool_call_id="call-1",
            tool_name="read_file",
            title="读取文件",
            arguments={"path": "README.md"},
            output="内容",
            duration_ms=12,
            exit_code=0,
            metadata={"path": "README.md"},
            approval_id="approval-1",
            permission_layer="mode",
            reason="只读工具自动允许",
            risk_level="LOW",
            reversible=True,
            decision="allow",
        )
    )

    assert response.model_dump(by_alias=True) == {
        "type": "tool_completed",
        "delta": "阶段说明",
        "model": "example-model",
        "usage": {
            "promptTokens": 11,
            "completionTokens": 7,
            "totalTokens": 18,
        },
        "activeContextTokens": 11,
        "errorMessage": "",
        "itemId": "item-1",
        "toolCallId": "call-1",
        "toolName": "read_file",
        "title": "读取文件",
        "arguments": {"path": "README.md"},
        "output": "内容",
        "durationMs": 12,
        "exitCode": 0,
        "metadata": {"path": "README.md"},
        "approvalId": "approval-1",
        "permissionLayer": "mode",
        "reason": "只读工具自动允许",
        "riskLevel": "LOW",
        "reversible": True,
        "decision": "allow",
    }
