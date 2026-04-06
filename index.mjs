import { jsx, jsxs, Fragment } from "react/jsx-runtime";
const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";
const plugin = ({ React, ui, store, sdk, icons }) => {
  const { useState, useMemo, useCallback, useRef, useEffect } = React;
  const { Award, X, Zap, BookOpen } = icons;
  store.registerType("tree", [
    { key: "title", label: "Tytuł", required: true },
    { key: "branches", label: "Gałęzie" },
    { key: "edges", label: "Krawędzie" },
    { key: "relations", label: "Typy relacji" },
    { key: "repo", label: "Repo" }
  ], "Drzewa wiedzy");
  store.registerType("node", [
    { key: "nodeId", label: "ID", required: true },
    { key: "title", label: "Tytuł", required: true },
    { key: "branch", label: "Gałąź" },
    { key: "tier", label: "Poziom" },
    { key: "hits", label: "Odkrycia" }
  ], "Węzły");
  store.registerType("content", [
    { key: "contentType", label: "Typ", required: true },
    { key: "text", label: "Tekst", required: true },
    { key: "answer", label: "Odpowiedź" }
  ], "Treści");
  store.registerType("lexicon", [
    { key: "term", label: "Termin", required: true },
    { key: "nodes", label: "Węzły", required: true },
    { key: "definition", label: "Definicja", required: true },
    { key: "relation", label: "Relacja" },
    { key: "quiz", label: "Quiz" },
    { key: "forms", label: "Formy" },
    { key: "category", label: "Kategoria" }
  ], "Leksykon");
  const FALLBACK_REL = { label: "inne", color: "neutral" };
  const DAISY_TOKENS = /* @__PURE__ */ new Set(["primary", "secondary", "accent", "info", "success", "warning", "error", "neutral", "base-100", "base-200", "base-300", "base-content"]);
  const tok = (name) => {
    if (!name) return "var(--color-neutral)";
    if (name.startsWith("#") || name.startsWith("var(") || name.startsWith("rgb")) return name;
    if (DAISY_TOKENS.has(name)) return `var(--color-${name})`;
    return "var(--color-neutral)";
  };
  store.registerType("discovery", [
    { key: "termId", label: "Termin", required: true },
    { key: "hits", label: "Odkrycia" },
    { key: "firstSeen", label: "Pierwsze" },
    { key: "lastSeen", label: "Ostatnie" }
  ], "Odkrycia");
  const edgeStr = (disc) => {
    const hits = Number(disc.data.hits) || 0;
    const lastSeen = Number(disc.data.lastSeen) || Date.now();
    const days = (Date.now() - lastSeen) / 864e5;
    return Math.min(hits / 5, 1) * Math.exp(-0.1 * days);
  };
  const discover = (termId) => {
    const all = store.getPosts("discovery");
    const existing = all.find((d) => d.data.termId === termId);
    const now = Date.now();
    if (existing) {
      store.update(existing.id, { hits: (Number(existing.data.hits) || 0) + 1, lastSeen: now });
    } else {
      store.add("discovery", { termId, hits: 1, firstSeen: now, lastSeen: now });
    }
  };
  const unlockNode = (postId) => {
    const n = store.get(postId);
    if (n) store.update(postId, { hits: Math.min((Number(n.data.hits) || 0) + 1, 5) });
  };
  const useNav = sdk.create(() => ({
    treeId: null,
    sel: null,
    phase: "map"
  }));
  const str = (n) => Math.min((Number(n.data.hits) || 0) / 5, 1);
  const jparse = (s, fb) => {
    try {
      return JSON.parse(s);
    } catch {
      return fb;
    }
  };
  function SkillTree() {
    const { treeId, sel, phase } = useNav();
    const tree = store.usePost(treeId || "");
    const nodes = store.useChildren(treeId || "", "node");
    const [revealed, setRevealed] = useState(() => /* @__PURE__ */ new Set());
    const flash = sdk.shared((s) => s == null ? void 0 : s.bqFlash);
    const [discoveredPairs, setDiscoveredPairs] = useState([]);
    useEffect(() => {
      if (!flash) return;
      const fromNode = nodes.find((n) => String(n.data.title) === flash.from);
      const toNode = nodes.find((n) => String(n.data.title) === flash.to);
      if (fromNode && toNode) {
        const fromNid = String(fromNode.data.nodeId);
        const toNid = String(toNode.data.nodeId);
        setDiscoveredPairs((prev) => {
          if (prev.some((p) => p.fromNid === fromNid && p.toNid === toNid || p.fromNid === toNid && p.toNid === fromNid))
            return prev.map((p) => p.fromNid === fromNid && p.toNid === toNid || p.fromNid === toNid && p.toNid === fromNid ? { ...p, fresh: true } : p);
          return [...prev.map((p) => ({ ...p, fresh: false })), { fromNid, toNid, fresh: true }];
        });
      } else {
        sdk.log(`bqFlash: nie znaleziono węzłów ${flash.from} / ${flash.to}`, "error");
      }
      sdk.shared.setState({ bqFlash: null });
    }, [flash]);
    const edges = useMemo(() => tree ? jparse(String(tree.data.edges || "[]"), []) : [], [tree]);
    const branches = useMemo(() => tree ? jparse(String(tree.data.branches || "{}"), {}) : {}, [tree]);
    const relations = useMemo(() => tree ? jparse(String(tree.data.relations || "{}"), {}) : {}, [tree]);
    const relDef = (r) => relations[r] || FALLBACK_REL;
    const adj = useMemo(() => {
      const a = /* @__PURE__ */ new Map();
      for (const e of edges) {
        if (!a.has(e.from)) a.set(e.from, /* @__PURE__ */ new Set());
        if (!a.has(e.to)) a.set(e.to, /* @__PURE__ */ new Set());
        a.get(e.from).add(e.to);
        a.get(e.to).add(e.from);
      }
      return a;
    }, [edges]);
    const { visible, frontier, discovered } = useMemo(() => {
      const disc = /* @__PURE__ */ new Set();
      for (const n of nodes) if (Number(n.data.hits) > 0) disc.add(String(n.data.nodeId));
      if (!disc.size) {
        const root = [...nodes].sort((a, b) => Number(a.data.tier) - Number(b.data.tier))[0];
        if (root) return { visible: /* @__PURE__ */ new Set([String(root.data.nodeId)]), frontier: /* @__PURE__ */ new Set([String(root.data.nodeId)]), discovered: disc };
        return { visible: /* @__PURE__ */ new Set(), frontier: /* @__PURE__ */ new Set(), discovered: disc };
      }
      const vis = new Set(disc);
      const front = /* @__PURE__ */ new Set();
      for (const nid of disc) for (const nb of adj.get(nid) || []) if (!disc.has(nb)) {
        vis.add(nb);
        front.add(nb);
      }
      return { visible: vis, frontier: front, discovered: disc };
    }, [nodes, adj]);
    const rootNid = useMemo(() => {
      const sorted = [...nodes].sort((a, b) => Number(a.data.tier) - Number(b.data.tier));
      return sorted[0] ? String(sorted[0].data.nodeId) : null;
    }, [nodes]);
    const layout = useMemo(() => {
      const pos = /* @__PURE__ */ new Map();
      if (!rootNid) return pos;
      const cx = 0, cy = 0;
      pos.set(rootNid, { x: cx, y: cy });
      const dist = /* @__PURE__ */ new Map();
      dist.set(rootNid, 0);
      const par = /* @__PURE__ */ new Map();
      const queue = [rootNid];
      while (queue.length) {
        const cur = queue.shift();
        for (const nb of adj.get(cur) || [])
          if (!dist.has(nb)) {
            dist.set(nb, dist.get(cur) + 1);
            par.set(nb, cur);
            queue.push(nb);
          }
      }
      const layer1 = [...dist.entries()].filter(([, d]) => d === 1).map(([n]) => n);
      const r1 = 200;
      layer1.forEach((nid, i) => {
        const a = i / layer1.length * Math.PI * 2 - Math.PI / 2;
        pos.set(nid, { x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 });
      });
      for (let layer = 2; layer <= 10; layer++) {
        const nids = [...dist.entries()].filter(([, d]) => d === layer).map(([n]) => n);
        for (const nid of nids) {
          const p = par.get(nid);
          const pp = p ? pos.get(p) : null;
          if (!pp) continue;
          const dx = pp.x - cx, dy = pp.y - cy, angle = Math.atan2(dy, dx);
          const sibs = nids.filter((s) => par.get(s) === p);
          const si = sibs.indexOf(nid);
          const spread = sibs.length > 1 ? (si - (sibs.length - 1) / 2) * 0.35 : 0;
          const r = Math.sqrt(dx * dx + dy * dy) + r1 * 0.75;
          pos.set(nid, { x: cx + Math.cos(angle + spread) * r, y: cy + Math.sin(angle + spread) * r });
        }
      }
      return pos;
    }, [rootNid, adj]);
    const discoveries = store.usePosts("discovery");
    const terms = store.useChildren(treeId || "", "lexicon");
    const contextEdges = useMemo(() => {
      const discoveredTermIds = new Set(discoveries.map((d) => String(d.data.termId)));
      if (!discoveredTermIds.size) return [];
      const map = /* @__PURE__ */ new Map();
      for (const term of terms) {
        if (!discoveredTermIds.has(term.id)) continue;
        const termNodes = jparse(String(term.data.nodes || "[]"), []);
        if (termNodes.length < 2) continue;
        const rel = String(term.data.relation || "inne");
        for (let i = 0; i < termNodes.length; i++)
          for (let j = i + 1; j < termNodes.length; j++) {
            if (!visible.has(termNodes[i]) || !visible.has(termNodes[j])) continue;
            const [a, b] = [termNodes[i], termNodes[j]].sort();
            const key = `${a}:${b}`;
            if (!map.has(key)) map.set(key, { from: a, to: b, rels: /* @__PURE__ */ new Map() });
            const entry = map.get(key);
            entry.rels.set(rel, (entry.rels.get(rel) || 0) + 1);
          }
      }
      const out = [];
      for (const { from, to, rels } of map.values()) {
        let best = "inne", bestCount = 0, total = 0;
        for (const [r, c] of rels) {
          total += c;
          if (c > bestCount) {
            best = r;
            bestCount = c;
          }
        }
        out.push({ from, to, relation: best, count: total, strength: Math.min(0.4 + total * 0.15, 0.9) });
      }
      return out;
    }, [discoveries, terms, visible]);
    const nextNid = useMemo(() => {
      const discNodeIds = new Set(nodes.filter((n) => Number(n.data.hits) > 0).map((n) => String(n.data.nodeId)));
      if (!discNodeIds.size) return rootNid;
      const scores = /* @__PURE__ */ new Map();
      for (const t of terms) {
        const tn = jparse(String(t.data.nodes || "[]"), []);
        if (!tn.some((x) => discNodeIds.has(x))) continue;
        for (const x of tn) if (!discNodeIds.has(x)) scores.set(x, (scores.get(x) || 0) + 1);
      }
      let best = "", bs = 0;
      for (const [k, v] of scores) if (v > bs) {
        best = k;
        bs = v;
      }
      return best || rootNid;
    }, [nodes, terms, rootNid]);
    const C = {
      bg: "var(--color-base-100)",
      surface: "var(--color-base-200)",
      edge: "var(--color-base-content)",
      warn: "var(--color-warning)",
      primary: "var(--color-primary)",
      text: "var(--color-base-content)",
      muted: "var(--color-base-300)"
    };
    const focusNid = sel ? (() => {
      const n = store.get(sel);
      return n ? String(n.data.nodeId) : rootNid;
    })() : rootNid;
    const snapTo = layout.get(focusNid || "") || { x: 0, y: 0 };
    const svgRef = useRef(null);
    const camRef = useRef({ x: snapTo.x, y: snapTo.y });
    const dragRef = useRef(null);
    const viewR = 340;
    const setVB = () => {
      var _a;
      const c = camRef.current;
      (_a = svgRef.current) == null ? void 0 : _a.setAttribute("viewBox", `${c.x - viewR} ${c.y - viewR} ${viewR * 2} ${viewR * 2}`);
    };
    const animRef = useRef(0);
    const prevSel = useRef(sel);
    if (sel !== prevSel.current) {
      prevSel.current = sel;
      const from = { ...camRef.current }, to = snapTo;
      cancelAnimationFrame(animRef.current);
      let t = 0;
      const step = () => {
        t = Math.min(t + 0.06, 1);
        const e = t * (2 - t);
        camRef.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
        setVB();
        if (t < 1) animRef.current = requestAnimationFrame(step);
      };
      animRef.current = requestAnimationFrame(step);
    }
    useEffect(setVB, [sel]);
    const vb = `${camRef.current.x - viewR} ${camRef.current.y - viewR} ${viewR * 2} ${viewR * 2}`;
    const startDrag = useCallback((clientX, clientY) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scale = viewR * 2 / rect.width;
      dragRef.current = { sx: clientX, sy: clientY, cx: camRef.current.x, cy: camRef.current.y };
      const move = (cx, cy) => {
        const d = dragRef.current;
        if (!d) return;
        camRef.current = { x: d.cx - (cx - d.sx) * scale, y: d.cy - (cy - d.sy) * scale };
        setVB();
      };
      const onMM = (ev) => move(ev.clientX, ev.clientY);
      const onTM = (ev) => {
        ev.preventDefault();
        move(ev.touches[0].clientX, ev.touches[0].clientY);
      };
      const up = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMM);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", onTM);
        window.removeEventListener("touchend", up);
      };
      window.addEventListener("mousemove", onMM);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", onTM, { passive: false });
      window.addEventListener("touchend", up);
    }, [viewR]);
    if (!treeId) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Wybierz drzewo z listy" });
    if (!nodes.length) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Zaimportuj paczkę bazową" });
    const visNodes = nodes.filter((n) => visible.has(String(n.data.nodeId)));
    const visEdges = edges.filter((e) => visible.has(e.from) && visible.has(e.to));
    !discovered.size;
    return /* @__PURE__ */ jsxs(
      "svg",
      {
        ref: svgRef,
        viewBox: vb,
        style: { width: "100%", height: "100%", cursor: "grab", userSelect: "none", display: "block", touchAction: "none" },
        onMouseDown: (e) => startDrag(e.clientX, e.clientY),
        onTouchStart: (e) => startDrag(e.touches[0].clientX, e.touches[0].clientY),
        children: [
          /* @__PURE__ */ jsxs("defs", { children: [
            /* @__PURE__ */ jsxs("filter", { id: "glow", children: [
              /* @__PURE__ */ jsx("feGaussianBlur", { stdDeviation: "4", result: "blur" }),
              /* @__PURE__ */ jsxs("feMerge", { children: [
                /* @__PURE__ */ jsx("feMergeNode", { in: "blur" }),
                /* @__PURE__ */ jsx("feMergeNode", { in: "SourceGraphic" })
              ] })
            ] }),
            /* @__PURE__ */ jsx("filter", { id: "shadow", x: "-50%", y: "-50%", width: "200%", height: "200%", children: /* @__PURE__ */ jsx("feDropShadow", { dx: "0", dy: "3", stdDeviation: "2", floodOpacity: "0.25" }) })
          ] }),
          visEdges.map((e, i) => {
            const f = layout.get(e.from), t = layout.get(e.to);
            return f && t ? /* @__PURE__ */ jsx(
              "line",
              {
                x1: f.x,
                y1: f.y,
                x2: t.x,
                y2: t.y,
                style: { stroke: C.edge },
                strokeWidth: 10,
                strokeLinecap: "round",
                opacity: 0.08
              },
              i
            ) : null;
          }),
          contextEdges.map((ce, i) => {
            const f = layout.get(ce.from), t = layout.get(ce.to);
            if (!f || !t) return null;
            const rd = relDef(ce.relation);
            const col = tok(rd.color);
            const mx = (f.x + t.x) / 2, my = (f.y + t.y) / 2;
            const label = `${rd.label}${ce.count > 1 ? ` ·${ce.count}` : ""}`;
            const lw = label.length * 4.2 + 8;
            return /* @__PURE__ */ jsxs("g", { children: [
              /* @__PURE__ */ jsx(
                "line",
                {
                  x1: f.x,
                  y1: f.y,
                  x2: t.x,
                  y2: t.y,
                  style: { stroke: col },
                  strokeWidth: 3 + Math.min(ce.count, 3),
                  strokeLinecap: "round",
                  opacity: ce.strength * 0.75,
                  filter: "url(#glow)"
                }
              ),
              /* @__PURE__ */ jsx(
                "rect",
                {
                  x: mx - lw / 2,
                  y: my - 7,
                  width: lw,
                  height: 12,
                  rx: 6,
                  style: { fill: C.bg, stroke: col },
                  strokeWidth: 1,
                  opacity: 0.95
                }
              ),
              /* @__PURE__ */ jsx("text", { x: mx, y: my + 2, textAnchor: "middle", style: { fill: col, pointerEvents: "none", fontWeight: 600 }, fontSize: 8, children: label })
            ] }, `ctx-${i}`);
          }),
          discoveredPairs.map((pair, i) => {
            const f = layout.get(pair.fromNid), t = layout.get(pair.toNid);
            if (!f || !t) return null;
            return /* @__PURE__ */ jsx("g", { children: /* @__PURE__ */ jsx(
              "line",
              {
                x1: f.x,
                y1: f.y,
                x2: t.x,
                y2: t.y,
                style: { stroke: C.warn },
                strokeWidth: pair.fresh ? 6 : 4,
                strokeLinecap: "round",
                opacity: pair.fresh ? 0.9 : 0.55,
                filter: "url(#glow)",
                children: pair.fresh && /* @__PURE__ */ jsx("animate", { attributeName: "opacity", values: "1;0.4;1;0.9", dur: "1s", repeatCount: "3", fill: "freeze" })
              }
            ) }, `dp-${i}`);
          }),
          visNodes.map((n) => {
            var _a;
            const nid = String(n.data.nodeId), p = layout.get(nid);
            if (!p) return null;
            const s = str(n), disc = discovered.has(nid), front = frontier.has(nid), mast = s >= 1;
            const isNext = nid === nextNid && !disc;
            const isSel = sel === n.id;
            const r = mast ? 42 : disc ? 38 : 34;
            const bc = tok(((_a = branches[String(n.data.branch)]) == null ? void 0 : _a.color) || "neutral");
            const fill = disc ? bc : C.surface;
            const ringCol = disc ? bc : C.muted;
            return /* @__PURE__ */ jsxs("g", { onClick: () => {
              useNav.setState({ sel: n.id, phase: "detail" });
              sdk.shared.setState({ bq: { treeId, nodeId: nid, postId: n.id } });
              setRevealed((prev) => new Set(prev).add(nid));
            }, style: { cursor: "pointer" }, children: [
              isSel && /* @__PURE__ */ jsx("circle", { cx: p.x, cy: p.y, r: r + 10, fill: "none", style: { stroke: C.primary }, strokeWidth: 3, opacity: 0.7 }),
              isNext && [0, 0.7, 1.4].map((delay, k) => /* @__PURE__ */ jsxs("circle", { cx: p.x, cy: p.y, r, fill: "none", style: { stroke: C.primary }, strokeWidth: 7, children: [
                /* @__PURE__ */ jsx("animate", { attributeName: "r", values: `${r};${r + 34}`, dur: "2.1s", begin: `${delay}s`, repeatCount: "indefinite" }),
                /* @__PURE__ */ jsx("animate", { attributeName: "opacity", values: "1;0", dur: "2.1s", begin: `${delay}s`, repeatCount: "indefinite" }),
                /* @__PURE__ */ jsx("animate", { attributeName: "stroke-width", values: "7;1", dur: "2.1s", begin: `${delay}s`, repeatCount: "indefinite" })
              ] }, `sonar-${k}`)),
              /* @__PURE__ */ jsx("circle", { cx: p.x, cy: p.y + 4, r, style: { fill: C.edge }, opacity: 0.15 }),
              /* @__PURE__ */ jsx(
                "circle",
                {
                  cx: p.x,
                  cy: p.y,
                  r,
                  style: { fill, stroke: ringCol },
                  strokeWidth: disc ? 4 : 3,
                  filter: "url(#shadow)",
                  children: disc && !mast && /* @__PURE__ */ jsx("animate", { attributeName: "r", values: `${r};${r + 3};${r}`, dur: "2s", repeatCount: "1" })
                }
              ),
              mast && /* @__PURE__ */ jsx("circle", { cx: p.x, cy: p.y, r: r - 6, fill: "none", style: { stroke: C.bg }, strokeWidth: 3, opacity: 0.6 }),
              mast ? /* @__PURE__ */ jsx("text", { x: p.x, y: p.y + 9, textAnchor: "middle", fontSize: 30, style: { fill: C.bg, fontWeight: 700, pointerEvents: "none" }, children: "★" }) : disc ? /* @__PURE__ */ jsx("text", { x: p.x, y: p.y + 7, textAnchor: "middle", fontSize: 20, style: { fill: C.bg, fontWeight: 700, pointerEvents: "none" }, children: Number(n.data.hits) || 0 }) : /* @__PURE__ */ jsx("text", { x: p.x, y: p.y + 8, textAnchor: "middle", fontSize: 24, style: { fill: C.muted, fontWeight: 700, pointerEvents: "none" }, children: front ? "＋" : "🔒" }),
              /* @__PURE__ */ jsx(
                "text",
                {
                  x: p.x,
                  y: p.y + r + 18,
                  textAnchor: "middle",
                  style: { fill: C.text, fontWeight: disc ? 700 : 500, pointerEvents: "none" },
                  fontSize: 13,
                  opacity: disc ? 1 : revealed.has(nid) ? 0.6 : 0.35,
                  children: disc || revealed.has(nid) ? String(n.data.title).slice(0, 18) : "???"
                }
              )
            ] }, n.id);
          })
        ]
      }
    );
  }
  function NodeDetail({ id }) {
    const node = store.usePost(id);
    const treeId = useNav().treeId || "";
    const terms = store.useChildren(treeId, "lexicon");
    const discoveries = store.usePosts("discovery");
    if (!node) return null;
    const nodeId = String(node.data.nodeId);
    const s = str(node);
    const contents = store.useChildren(id, "content");
    const slideCount = contents.filter((c) => String(c.data.contentType) !== "quiz").length;
    const nodeTerms = terms.filter((t) => jparse(String(t.data.nodes || "[]"), []).includes(nodeId));
    const discSet = new Set(discoveries.map((d) => String(d.data.termId)));
    const discNodeTerms = nodeTerms.filter((t) => discSet.has(t.id)).length;
    const totalNodeTerms = nodeTerms.length;
    const hits = Number(node.data.hits) || 0;
    const step1Done = hits > 0 || discNodeTerms > 0;
    const step2Done = discNodeTerms >= Math.max(3, Math.ceil(totalNodeTerms * 0.3));
    const step3Done = s >= 1;
    const Step = ({ n, done, title, hint }) => /* @__PURE__ */ jsx(ui.Card, { color: done ? "success" : "neutral", children: /* @__PURE__ */ jsxs(ui.Stack, { gap: "sm", children: [
      /* @__PURE__ */ jsxs(ui.Row, { gap: "sm", children: [
        /* @__PURE__ */ jsx(ui.Badge, { color: done ? "success" : "neutral", children: done ? "✓" : n }),
        /* @__PURE__ */ jsx(ui.Text, { size: "xs", children: /* @__PURE__ */ jsx("b", { children: title }) })
      ] }),
      /* @__PURE__ */ jsx(ui.Text, { muted: true, size: "2xs", children: hint })
    ] }) });
    const go = (target) => {
      const base = { treeId, nodeId, postId: id };
      if (target === "reader") nav.toReader(base);
      else nav.toArena(base);
    };
    return /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
      /* @__PURE__ */ jsxs(ui.Row, { justify: "between", children: [
        /* @__PURE__ */ jsx(ui.Heading, { title: String(node.data.title) }),
        /* @__PURE__ */ jsxs(ui.Row, { gap: "sm", children: [
          /* @__PURE__ */ jsx(ui.Badge, { children: s >= 1 ? "★ Opanowane" : hits > 0 ? "Odkryte" : "Nowe" }),
          /* @__PURE__ */ jsx(ui.Button, { size: "xs", color: "ghost", onClick: () => useNav.setState({ phase: "map", sel: null }), children: /* @__PURE__ */ jsx(X, { size: 14 }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(ui.Grid, { cols: 3, gap: "sm", children: [
        /* @__PURE__ */ jsx(
          Step,
          {
            n: 1,
            done: step1Done,
            title: "Przeczytaj",
            hint: slideCount ? `${slideCount} slajdów` : "Wejdź do readera"
          }
        ),
        /* @__PURE__ */ jsx(
          Step,
          {
            n: 2,
            done: step2Done,
            title: "Odkrywaj terminy",
            hint: totalNodeTerms ? `Zapamiętane: ${discNodeTerms}/${totalNodeTerms}` : "Odkrywaj słowa"
          }
        ),
        /* @__PURE__ */ jsx(
          Step,
          {
            n: 3,
            done: step3Done,
            title: "Wygraj arenę",
            hint: totalNodeTerms ? `Znasz ${discNodeTerms}/${totalNodeTerms} terminów` : "Odblokuj sąsiadów"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs(ui.Grid, { cols: 2, gap: "sm", children: [
        /* @__PURE__ */ jsxs(ui.Button, { size: "lg", color: "primary", block: true, onClick: () => go("reader"), children: [
          /* @__PURE__ */ jsx(BookOpen, { size: 14 }),
          " Czytaj i odkrywaj terminy"
        ] }),
        /* @__PURE__ */ jsxs(ui.Button, { size: "lg", color: "primary", outline: true, block: true, onClick: () => go("arena"), children: [
          /* @__PURE__ */ jsx(Zap, { size: 14 }),
          " Arena ",
          totalNodeTerms ? `(${discNodeTerms}/${totalNodeTerms})` : ""
        ] })
      ] })
    ] }) });
  }
  const DEFAULT_ORG = "BrainEduPlay";
  const loadLexicon = async (base, tree) => {
    const nodes = store.getPosts("node").filter((n) => n.parentId === tree.id);
    const fetches = nodes.map(async (n) => {
      try {
        const r = await fetch(`${base}/lexicon/${n.data.nodeId}.json`);
        if (!r.ok) return 0;
        const entries = JSON.parse(await r.text());
        let count = 0;
        const existing = store.getPosts("lexicon").filter((x) => x.parentId === tree.id);
        for (const l of entries) {
          if (existing.some((x) => String(x.data.term) === String(l.data.term))) continue;
          store.add(l.type, l.data, { parentId: tree.id });
          count++;
        }
        return count;
      } catch {
        return 0;
      }
    });
    const counts = await Promise.all(fetches);
    return counts.reduce((a, b) => a + b, 0);
  };
  const loadTree = async (org, repo) => {
    var _a, _b;
    try {
      const base = `${GH_RAW}/${org}/${repo}/main`;
      const treeRes = await fetch(`${base}/tree.json`);
      if (!treeRes.ok) throw new Error(`tree.json: ${treeRes.status}`);
      const treeSeeds = JSON.parse(await treeRes.text());
      const treeTitleFromSeed = ((_b = (_a = treeSeeds[0]) == null ? void 0 : _a.data) == null ? void 0 : _b.title) || "";
      const treeCount = store.importJSON(treeSeeds);
      const trees = store.getPosts("tree");
      const tree = trees.find((t) => String(t.data.title) === treeTitleFromSeed);
      if (tree) {
        const lexCount = await loadLexicon(base, tree);
        sdk.log(`${repo} — ${treeCount + lexCount} rekordów`, "ok");
        store.update(tree.id, { repo: `${org}/${repo}` });
      }
    } catch (e) {
      sdk.log(String(e), "error");
    }
  };
  const loadLexiconFromRepo = async (treeId, org, repo) => {
    const tree = store.get(treeId);
    if (!tree) return;
    const base = `${GH_RAW}/${org}/${repo}/main`;
    const count = await loadLexicon(base, tree);
    sdk.log(`${repo} — ${count} nowych terminów`, "ok");
  };
  const loadNodeContent = async (treeId, nodeId) => {
    const tree = store.get(treeId);
    if (!tree) return;
    const repo = String(tree.data.repo || "");
    if (!repo) return;
    const nodes = store.getPosts("node").filter((n) => n.parentId === treeId);
    const node = nodes.find((n) => String(n.data.nodeId) === nodeId);
    if (!node) return;
    const existing = store.getPosts("content").filter((c) => c.parentId === node.id);
    if (existing.length > 0) return;
    try {
      const r = await fetch(`${GH_RAW}/${repo}/main/content/${nodeId}.json`);
      if (!r.ok) return;
      const entries = JSON.parse(await r.text());
      for (const e of entries) {
        store.add(e.type, e.data, { parentId: node.id });
      }
    } catch (e) {
      sdk.log(`Content ${nodeId}: ${e}`, "error");
    }
  };
  function RepoPicker() {
    const org = store.useOption("bq:githubOrg") || DEFAULT_ORG;
    const [repos, setRepos] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
      fetch(`${GH_API}/search/repositories?q=org:${org}+topic:brainquest&per_page=100`).then((r) => r.ok ? r.json() : Promise.reject(r.status)).then((d) => setRepos(d.items.sort((a, b) => a.name.localeCompare(b.name)))).catch((e) => sdk.log(`GitHub: ${e}`, "error")).finally(() => setLoading(false));
    }, [org]);
    return /* @__PURE__ */ jsx(ui.Page, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
      /* @__PURE__ */ jsx(ui.Heading, { title: "Wybierz przedmiot", subtitle: "Kliknij aby rozpocząć naukę" }),
      loading && /* @__PURE__ */ jsx(ui.Spinner, {}),
      repos.map((r) => /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsxs(ui.Row, { justify: "between", children: [
        /* @__PURE__ */ jsxs(ui.Stack, { children: [
          /* @__PURE__ */ jsx(ui.Text, { bold: true, children: r.description || r.name }),
          /* @__PURE__ */ jsx(ui.Text, { muted: true, size: "xs", children: r.name })
        ] }),
        /* @__PURE__ */ jsx(ui.Button, { color: "primary", onClick: () => loadTree(org, r.name), children: "Rozpocznij" })
      ] }) }, r.name)),
      !loading && !repos.length && /* @__PURE__ */ jsx(ui.Text, { muted: true, children: "Brak dostępnych przedmiotów" })
    ] }) });
  }
  const removeTreeWithDiscoveries = (treeId) => {
    const termIds = new Set(
      store.getPosts("lexicon").filter((l) => l.parentId === treeId).map((l) => l.id)
    );
    const orphans = store.getPosts("discovery").filter((d) => termIds.has(String(d.data.termId)));
    for (const d of orphans) store.remove(d.id);
    store.remove(treeId);
    if (orphans.length) sdk.log(`Usunięto drzewo + ${orphans.length} odkryć`, "ok");
  };
  function TreeItem({ tree, active }) {
    const nodes = store.useChildren(tree.id, "node");
    const d = nodes.filter((n) => Number(n.data.hits) > 0).length;
    return /* @__PURE__ */ jsx(
      ui.ListItem,
      {
        active,
        label: String(tree.data.title),
        detail: `${d}/${nodes.length} odkryte`,
        onClick: () => useNav.setState({ treeId: tree.id, sel: null, phase: "map" }),
        action: /* @__PURE__ */ jsx(ui.RemoveButton, { onClick: () => {
          removeTreeWithDiscoveries(tree.id);
          if (active) useNav.setState({ treeId: null, sel: null, phase: "map" });
        } })
      }
    );
  }
  function TreeList() {
    const { treeId } = useNav();
    const trees = store.usePosts("tree");
    if (!trees.length) return null;
    return /* @__PURE__ */ jsx(ui.Box, { header: /* @__PURE__ */ jsx(ui.Cell, { label: true, children: "Drzewa wiedzy" }), body: /* @__PURE__ */ jsx(ui.Stack, { children: trees.map((t) => /* @__PURE__ */ jsx(TreeItem, { tree: t, active: treeId === t.id }, t.id)) }), grow: true });
  }
  function Progress() {
    var _a;
    const navTreeId = useNav().treeId;
    const sharedTreeId = (_a = sdk.shared((s) => s == null ? void 0 : s.bq)) == null ? void 0 : _a.treeId;
    const treeId = navTreeId || sharedTreeId || "";
    const nodes = store.useChildren(treeId, "node");
    const terms = store.useChildren(treeId, "lexicon");
    const discoveries = store.usePosts("discovery");
    const { density, discPairs, allPairs, nextNode } = useMemo(() => {
      const nodeIdSet = new Set(nodes.map((n) => String(n.data.nodeId)));
      const discTermIds = new Set(discoveries.map((d2) => String(d2.data.termId)));
      const discNodeIds = new Set(nodes.filter((n) => Number(n.data.hits) > 0).map((n) => String(n.data.nodeId)));
      const all = /* @__PURE__ */ new Set();
      const disc = /* @__PURE__ */ new Set();
      const scores = /* @__PURE__ */ new Map();
      for (const t of terms) {
        const tn = jparse(String(t.data.nodes || "[]"), []).filter((x) => nodeIdSet.has(x));
        const isDisc = discTermIds.has(t.id);
        for (let i = 0; i < tn.length; i++) for (let j = i + 1; j < tn.length; j++) {
          const key = [tn[i], tn[j]].sort().join(":");
          all.add(key);
          if (isDisc) disc.add(key);
        }
        if (discNodeIds.size && tn.some((x) => discNodeIds.has(x))) {
          for (const x of tn) if (!discNodeIds.has(x)) scores.set(x, (scores.get(x) || 0) + 1);
        }
      }
      let bestNid = "", bestScore = 0;
      for (const [k, v] of scores) if (v > bestScore) {
        bestNid = k;
        bestScore = v;
      }
      const next = bestNid ? nodes.find((n) => String(n.data.nodeId) === bestNid) || null : null;
      return { density: all.size ? Math.round(disc.size / all.size * 100) : 0, discPairs: disc.size, allPairs: all.size, nextNode: next };
    }, [nodes, terms, discoveries]);
    if (!treeId) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Wybierz drzewo" });
    const d = nodes.filter((n) => Number(n.data.hits) > 0);
    return /* @__PURE__ */ jsx(ui.Box, { header: /* @__PURE__ */ jsx(ui.Cell, { label: true, children: "Postęp" }), body: d.length === 0 ? /* @__PURE__ */ jsx(ui.Placeholder, { text: "Odkrywaj węzły na mapie", children: /* @__PURE__ */ jsx(Award, { size: 32 }) }) : /* @__PURE__ */ jsxs(ui.Stack, { children: [
      /* @__PURE__ */ jsxs(ui.Stats, { children: [
        /* @__PURE__ */ jsx(ui.Stat, { title: "Gęstość", value: `${density}%` }),
        /* @__PURE__ */ jsx(ui.Stat, { title: "Połączenia", value: `${discPairs}/${allPairs}` })
      ] }),
      /* @__PURE__ */ jsxs(ui.Stats, { children: [
        /* @__PURE__ */ jsx(ui.Stat, { title: "Odkryte", value: `${d.length}/${nodes.length}` }),
        /* @__PURE__ */ jsx(ui.Stat, { title: "Opanowane", value: `${nodes.filter((n) => str(n) >= 1).length}` })
      ] }),
      nextNode && /* @__PURE__ */ jsxs(ui.Stack, { children: [
        /* @__PURE__ */ jsx(ui.Cell, { label: true, children: "Co dalej?" }),
        /* @__PURE__ */ jsxs(ui.Button, { size: "sm", color: "primary", outline: true, block: true, onClick: () => {
          useNav.setState({ sel: nextNode.id, phase: "detail" });
          sdk.shared.setState({ bq: { treeId, nodeId: String(nextNode.data.nodeId), postId: nextNode.id } });
        }, children: [
          /* @__PURE__ */ jsx(Zap, { size: 12 }),
          " ",
          String(nextNode.data.title)
        ] })
      ] }),
      d.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map((n) => /* @__PURE__ */ jsxs(ui.Row, { gap: "sm", children: [
        str(n) >= 1 ? /* @__PURE__ */ jsx(Award, { size: 12 }) : /* @__PURE__ */ jsx(Zap, { size: 12 }),
        /* @__PURE__ */ jsx(ui.Text, { size: "sm", children: String(n.data.title) })
      ] }, n.id))
    ] }), grow: true });
  }
  function CheatSheet({ filter, onBack, backIcon }) {
    const bq = sdk.shared((s) => s == null ? void 0 : s.bq);
    const treeId = (bq == null ? void 0 : bq.treeId) || useNav().treeId || "";
    const lexicon = store.useChildren(treeId, "lexicon");
    const discoveries = store.usePosts("discovery");
    const items = useMemo(() => {
      const discSet = new Set(discoveries.map((d) => String(d.data.termId)));
      return lexicon.filter((l) => discSet.has(l.id) && (!filter || filter(l.id))).map((l) => ({ id: l.id, term: String(l.data.term || ""), definition: String(l.data.definition || "") }));
    }, [lexicon, discoveries, filter]);
    const goRead = () => nav.toReader();
    const BackIcon = backIcon || X;
    const header = onBack ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(ui.Cell, { onClick: onBack, children: /* @__PURE__ */ jsx(BackIcon, { size: 14 }) }),
      /* @__PURE__ */ jsx(ui.Cell, { label: true, children: "Ściągawka" })
    ] }) : /* @__PURE__ */ jsx(ui.Cell, { label: true, children: "Ściągawka" });
    return /* @__PURE__ */ jsx(ui.Box, { header, body: items.length === 0 ? /* @__PURE__ */ jsxs(ui.Stack, { gap: "sm", children: [
      /* @__PURE__ */ jsx(ui.Text, { size: "sm", bold: true, children: "Brak odkrytych terminów" }),
      /* @__PURE__ */ jsx(ui.Text, { size: "xs", muted: true, children: "Tu pojawi się ściągawka — terminy które znasz z czytania. Każdy odkryty termin = jedna znana odpowiedź w Arenie." }),
      /* @__PURE__ */ jsx(ui.Text, { size: "xs", muted: true, children: "Wróć do readera i odkrywaj terminy klikając podświetlone słowa." }),
      /* @__PURE__ */ jsxs(ui.Button, { size: "sm", color: "primary", block: true, onClick: goRead, children: [
        /* @__PURE__ */ jsx(BookOpen, { size: 12 }),
        " Do readera"
      ] })
    ] }) : /* @__PURE__ */ jsx(ui.Stack, { gap: "sm", children: items.map((t) => /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsxs(ui.Stack, { gap: "xs", children: [
      /* @__PURE__ */ jsx(ui.Text, { size: "xs", bold: true, children: t.term }),
      /* @__PURE__ */ jsx(ui.Text, { size: "xs", muted: true, children: t.definition })
    ] }) }, t.id)) }), grow: true });
  }
  const getBq = () => {
    var _a;
    return (_a = sdk.shared.getState()) == null ? void 0 : _a.bq;
  };
  const useBq = () => sdk.shared((s) => s == null ? void 0 : s.bq);
  const goTo = (activeId, patch = {}) => {
    sdk.shared.setState({ bq: { ...getBq() || {}, ...patch } });
    sdk.useHostStore.setState({ activeId });
  };
  const nav = {
    toMap: (extra = {}) => goTo("plugin-brain-quest", { phase: "map", challenge: false, ...extra }),
    toReader: (extra = {}) => goTo("plugin-brain-quest-reader", { challenge: false, ...extra }),
    toArena: (extra = {}) => goTo("plugin-brain-quest-arena", { challenge: true, ...extra })
  };
  sdk.shared.setState({ bqHelpers: { discover, unlockNode, edgeStr, loadNodeContent, loadLexiconFromRepo, jparse, str, Progress, CheatSheet, nav, useBq, getBq } });
  function Center() {
    const { treeId, phase, sel } = useNav();
    const trees = store.usePosts("tree");
    useEffect(() => {
      if (!treeId && trees.length) useNav.setState({ treeId: trees[0].id });
    }, [treeId, trees.length]);
    if (!treeId && !trees.length) return /* @__PURE__ */ jsx(RepoPicker, {});
    if (!treeId) return null;
    return /* @__PURE__ */ jsx(
      ui.OverlayContainer,
      {
        base: /* @__PURE__ */ jsx(SkillTree, {}),
        overlay: phase === "detail" && sel ? /* @__PURE__ */ jsx(NodeDetail, { id: sel }) : null,
        position: "bottom"
      }
    );
  }
  sdk.registerView("bq.left", { slot: "left", component: TreeList });
  sdk.registerView("bq.center", { slot: "center", component: Center });
  sdk.registerView("bq.right", { slot: "right", component: Progress });
  return { id: "plugin-brain-quest", label: "BrainQuest", icon: Award, version: "0.4.0" };
};
export {
  plugin as default
};
