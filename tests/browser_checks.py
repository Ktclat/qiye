"""Polling helpers for browser conditions that resolve asynchronously."""
from time import monotonic


def wait_for_async(page, expression, *, arg=None, timeout=15000):
    # Playwright 1.56's wait_for_function treats a Promise as truthy and does
    # not retry when it resolves to false. Evaluate awaits it before polling.
    deadline = monotonic() + timeout / 1000
    while True:
        result = page.evaluate(expression, arg)
        if result:
            return result
        if monotonic() >= deadline:
            raise AssertionError(f'Async browser condition did not become true: {expression}')
        page.wait_for_timeout(50)
