import { useRef, useState } from 'preact/hooks';
import {
  loadBabel,
  transformLessonCode,
  buildSrcdoc,
  copyFor,
  isRvMessage,
  VERSIONS_BADGE,
  REACT_CDN_VERSION,
  type CommitMessage,
} from './render-visualizer-runtime';

// Hydrates with client:visible, so `document` is available by the time it renders.
function lang(): string | undefined {
  return typeof document === 'undefined' ? 'en' : document.documentElement.lang;
}

interface Row {
  name: string;
  renders: number;
  lastCommitMs: number | null;
}

export default function RenderVisualizerIsland({ code }: { code: string }) {
  const t = copyFor(lang());
  const th = lang()?.startsWith('th');

  const [frameKey, setFrameKey] = useState(0);
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [commits, setCommits] = useState<CommitMessage[]>([]);
  const prevCounts = useRef<Record<string, number>>({});
  const listenerBound = useRef(false);

  function onMessage(e: MessageEvent) {
    if (!isRvMessage(e.data)) return;
    if (e.data.type === 'error') {
      setError(e.data.message);
      return;
    }
    const msg = e.data;
    const prev = prevCounts.current;
    const nextRows: Row[] = Object.keys(msg.counts)
      .sort()
      .map((name) => {
        const total = msg.counts[name];
        const rendered = total > (prev[name] ?? 0);
        return { name, renders: total, lastCommitMs: rendered ? msg.actualDuration : null };
      });
    // Keep any previously-seen component that didn't render this commit,
    // carrying its last-known "last commit" value forward.
    setRows((old) => {
      const byName = new Map(old.map((r) => [r.name, r]));
      for (const r of nextRows) byName.set(r.name, r);
      return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
    });
    prevCounts.current = msg.counts;
    setCommits((old) => [...old, msg]);
  }

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const babel = await loadBabel();
      setBadge(
        th
          ? `Babel ${babel.version} (jsdelivr) · React ${REACT_CDN_VERSION} dev build (esm.sh, ปักหมุดเวอร์ชัน)`
          : `Babel ${babel.version} (jsdelivr) · React ${REACT_CDN_VERSION} dev build (esm.sh, pinned)`,
      );
      const js = transformLessonCode(babel, code);
      if (!listenerBound.current) {
        window.addEventListener('message', onMessage);
        listenerBound.current = true;
      }
      setSrcdoc(buildSrcdoc(js));
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setRows([]);
    setCommits([]);
    setError(null);
    prevCounts.current = {};
    setFrameKey((k) => k + 1);
    if (srcdoc) run();
  }

  return (
    <div class="rv not-content">
      <div class="rv__bar">
        <span class="rv__badge" title={VERSIONS_BADGE.en}>
          {badge ?? VERSIONS_BADGE[th ? 'th' : 'en']}
        </span>
        <span class="rv__actions">
          <button class="rv__run" onClick={run} disabled={running}>
            {running ? t.loading : t.run}
          </button>
          <button class="rv__reset" onClick={reset} disabled={!srcdoc}>
            {t.reset}
          </button>
        </span>
      </div>

      {error && <pre class="rv__err">{error}</pre>}

      {srcdoc && (
        <iframe
          key={frameKey}
          class="rv__frame"
          sandbox="allow-scripts"
          srcdoc={srcdoc}
          title="RenderVisualizer output"
        />
      )}

      <table class="rv__table">
        <thead>
          <tr>
            <th>{t.component}</th>
            <th>{t.renders}</th>
            <th>{t.lastCommit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3}>{t.noCommitsYet}</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.renders}</td>
                <td>{r.lastCommitMs === null ? t.dash : r.lastCommitMs.toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {commits.length > 0 && (
        <details class="rv__log">
          <summary>{t.commitLog}</summary>
          <table>
            <thead>
              <tr>
                <th>{t.commit}</th>
                <th>{t.phase}</th>
                <th>{t.duration}</th>
              </tr>
            </thead>
            <tbody>
              {commits.map((c) => (
                <tr key={c.n}>
                  <td>{c.n}</td>
                  <td>{c.phase}</td>
                  <td>{c.actualDuration.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
