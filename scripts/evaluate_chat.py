"""Record live answers for manual evaluation; never fabricate accuracy scores."""
import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:5002')
    parser.add_argument('--output', required=True)
    parser.add_argument('--interval', type=float, default=7)
    args = parser.parse_args()
    cases = json.loads((ROOT / 'tests' / 'fixtures' / 'rag_cases.json').read_text())
    results = []
    for index, case in enumerate(cases):
        if index:
            time.sleep(max(7, args.interval))
        start = time.monotonic()
        req = urllib.request.Request(args.base_url.rstrip('/') + '/chat', data=json.dumps({'message': case['question']}).encode(), headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                body, status = json.load(response), response.status
        except (urllib.error.URLError, TimeoutError) as exc:
            body, status = {'error': str(exc)}, getattr(exc, 'code', 0)
        results.append({**case, 'status': status, 'seconds': round(time.monotonic() - start, 3), 'response': body, 'manual_pass': None})
        Path(args.output).write_text(json.dumps(results, indent=2, ensure_ascii=True) + '\n')
        print(f"{case['id']}: HTTP {status}")

if __name__ == '__main__':
    main()
