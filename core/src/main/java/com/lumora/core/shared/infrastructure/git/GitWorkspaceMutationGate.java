package com.lumora.core.shared.infrastructure.git;

import org.springframework.stereotype.Service;

import java.util.Objects;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * Process-wide, reentrant gate for short Git workspace check-and-act regions.
 *
 * <p>The first implementation is deliberately repository-agnostic. Run
 * workspace binding and environment mutations are rare and short, while a
 * single gate avoids aliases between a primary worktree, linked worktrees and
 * subdirectory task paths. Callers that also use a service monitor must keep a
 * stable lock order and must not introduce a callback that acquires those two
 * locks in reverse order.</p>
 */
@Service
public class GitWorkspaceMutationGate {

    private final ReentrantLock lock = new ReentrantLock(true);

    public <T> T execute(Supplier<T> operation) {
        Objects.requireNonNull(operation, "operation");
        try {
            lock.lockInterruptibly();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "等待 Git Workspace 安全边界时被中断", error
            );
        }
        try {
            return operation.get();
        } finally {
            lock.unlock();
        }
    }

    public void execute(Runnable operation) {
        Objects.requireNonNull(operation, "operation");
        execute(() -> {
            operation.run();
            return null;
        });
    }
}
