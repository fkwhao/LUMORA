package com.lumora.core.exception;

import com.lumora.core.agent.exception.AgentRuntimeException;
import com.lumora.core.common.constant.ErrorCodeConstants;
import com.lumora.core.dto.response.ErrorResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class RestExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(
            MethodArgumentNotValidException error
    ) {
        String message = error.getBindingResult().getFieldErrors().isEmpty()
                ? "请求参数无效"
                : error.getBindingResult().getFieldErrors().get(0)
                        .getDefaultMessage();
        return response(
                HttpStatus.BAD_REQUEST,
                ErrorCodeConstants.INVALID_REQUEST,
                message
        );
    }

    @ExceptionHandler({
        IllegalArgumentException.class,
        HttpMessageNotReadableException.class
    })
    public ResponseEntity<ErrorResponse> handleBadRequest(Exception error) {
        return response(
                HttpStatus.BAD_REQUEST,
                ErrorCodeConstants.INVALID_REQUEST,
                "请求参数无效"
        );
    }

    @ExceptionHandler(TaskNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(
            TaskNotFoundException error
    ) {
        return response(
                HttpStatus.NOT_FOUND,
                ErrorCodeConstants.TASK_NOT_FOUND,
                error.getMessage()
        );
    }

    @ExceptionHandler({
        IllegalTaskTransitionException.class,
        IllegalStateException.class
    })
    public ResponseEntity<ErrorResponse> handleConflict(Exception error) {
        return response(
                HttpStatus.CONFLICT,
                ErrorCodeConstants.TASK_CONFLICT,
                error.getMessage()
        );
    }

    @ExceptionHandler(AgentRuntimeException.class)
    public ResponseEntity<ErrorResponse> handleAgentFailure(
            AgentRuntimeException error
    ) {
        // Agent 内部异常统一转换为稳定的网关错误，不向 Electron 返回调用栈。
        return response(
                HttpStatus.BAD_GATEWAY,
                ErrorCodeConstants.AGENT_UNAVAILABLE,
                error.getMessage()
        );
    }

    private ResponseEntity<ErrorResponse> response(
            HttpStatus status,
            String code,
            String message
    ) {
        return ResponseEntity
                .status(status)
                .body(new ErrorResponse(code, message));
    }
}
