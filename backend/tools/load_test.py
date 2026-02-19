import argparse
import concurrent.futures
import statistics
import threading
import time
import urllib.error
import urllib.request


def run_request(url: str, timeout: float) -> tuple[bool, float]:
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            ok = 200 <= response.status < 300
    except urllib.error.URLError:
        ok = False
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    return ok, elapsed_ms


def main() -> None:
    parser = argparse.ArgumentParser(description="Simple HTTP load test for Project MACA backend")
    parser.add_argument("--url", default="http://127.0.0.1:8000/api/v1/health")
    parser.add_argument("--seconds", type=int, default=20)
    parser.add_argument("--workers", type=int, default=20)
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()

    stop_at = time.time() + max(1, args.seconds)
    lock = threading.Lock()
    durations: list[float] = []
    total = 0
    success = 0

    def worker() -> None:
        nonlocal total, success
        while time.time() < stop_at:
            ok, elapsed_ms = run_request(args.url, args.timeout)
            with lock:
                total += 1
                if ok:
                    success += 1
                durations.append(elapsed_ms)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(worker) for _ in range(max(1, args.workers))]
        for future in futures:
            future.result()

    failures = total - success
    avg_ms = statistics.mean(durations) if durations else 0.0
    p95_ms = statistics.quantiles(durations, n=20)[18] if len(durations) >= 20 else avg_ms
    rps = total / max(1, args.seconds)

    print("Load Test Result")
    print(f"url={args.url}")
    print(f"duration_seconds={args.seconds}")
    print(f"workers={args.workers}")
    print(f"requests_total={total}")
    print(f"requests_success={success}")
    print(f"requests_failed={failures}")
    print(f"requests_per_second={rps:.2f}")
    print(f"avg_latency_ms={avg_ms:.2f}")
    print(f"p95_latency_ms={p95_ms:.2f}")


if __name__ == "__main__":
    main()
