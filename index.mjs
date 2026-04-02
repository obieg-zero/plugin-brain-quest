import { jsx, jsxs } from "react/jsx-runtime";
const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";
const plugin = ({ React, ui, store, sdk, icons }) => {
  const { useState, useMemo, useCallback, useRef, useEffect } = React;
  const { Award, Star, Check, X, Zap } = icons;
  store.registerType("tree", [
    { key: "title", label: "Tytuł", required: true },
    { key: "branches", label: "Gałęzie" },
    { key: "edges", label: "Krawędzie" }
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
    { key: "forms", label: "Formy" },
    { key: "definition", label: "Definicja", required: true },
    { key: "example", label: "Przykład" },
    { key: "category", label: "Kategoria" }
  ], "Leksykon");
  store.registerType("context", [
    { key: "ctxType", label: "Typ", required: true },
    { key: "title", label: "Tytuł", required: true },
    { key: "lexiconIds", label: "Terminy" },
    { key: "contextData", label: "Dane" }
  ], "Konteksty");
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
    if (n) store.update(postId, { hits: (Number(n.data.hits) || 0) + 1 });
  };
  sdk.shared.setState({ bqHelpers: { discover, unlockNode, edgeStr } });
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
  const generateContexts = (treeId) => {
    const lexicon = store.getPosts("lexicon").filter((l) => l.parentId === treeId);
    const categories = /* @__PURE__ */ new Map();
    for (const lex of lexicon) {
      const cat = String(lex.data.category || "inne");
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat).push(lex.id);
    }
    for (const [cat, ids] of categories) {
      store.add("context", {
        ctxType: cat,
        title: cat.charAt(0).toUpperCase() + cat.slice(1),
        lexiconIds: JSON.stringify(ids),
        contextData: "{}"
      }, { parentId: treeId });
    }
  };
  function SkillTree() {
    const { treeId, sel, phase } = useNav();
    const tree = store.usePost(treeId || "");
    const nodes = store.useChildren(treeId || "", "node");
    const edges = useMemo(() => tree ? jparse(String(tree.data.edges || "[]"), []) : [], [tree]);
    const branches = useMemo(() => tree ? jparse(String(tree.data.branches || "{}"), {}) : {}, [tree]);
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
      const r1 = 150;
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
          const r = Math.sqrt(dx * dx + dy * dy) + r1 * 0.8;
          pos.set(nid, { x: cx + Math.cos(angle + spread) * r, y: cy + Math.sin(angle + spread) * r });
        }
      }
      return pos;
    }, [rootNid, adj]);
    const discoveries = store.usePosts("discovery");
    const contextEdges = useMemo(() => {
      const discoveredTermIds = new Set(discoveries.map((d) => String(d.data.termId)));
      if (!discoveredTermIds.size) return [];
      const lexicon = store.getPosts("lexicon");
      const catToNodes = /* @__PURE__ */ new Map();
      for (const lex of lexicon) {
        if (!discoveredTermIds.has(lex.id)) continue;
        const cat = String(lex.data.category || "");
        if (!cat) continue;
        if (!catToNodes.has(cat)) catToNodes.set(cat, /* @__PURE__ */ new Set());
        for (const n of nodes) {
          if (!discovered.has(String(n.data.nodeId))) continue;
          if (String(n.data.branch).toLowerCase() === cat.toLowerCase() || String(n.data.title).toLowerCase().includes(cat.toLowerCase()))
            catToNodes.get(cat).add(String(n.data.nodeId));
        }
      }
      const pairs = [];
      for (const [, nids] of catToNodes) {
        const arr = [...nids];
        for (let i = 0; i < arr.length; i++)
          for (let j = i + 1; j < arr.length; j++)
            if (visible.has(arr[i]) && visible.has(arr[j]))
              pairs.push({ from: arr[i], to: arr[j], strength: Math.min(nids.size / 3, 1) });
      }
      return pairs;
    }, [discoveries, nodes, discovered, visible]);
    const focusNid = sel ? (() => {
      const n = store.get(sel);
      return n ? String(n.data.nodeId) : rootNid;
    })() : rootNid;
    const snapTo = layout.get(focusNid || "") || { x: 0, y: 0 };
    const svgRef = useRef(null);
    const camRef = useRef({ x: snapTo.x, y: snapTo.y });
    const dragRef = useRef(null);
    const viewR = 300;
    const prevSel = useRef(sel);
    if (sel !== prevSel.current) {
      prevSel.current = sel;
      camRef.current = { x: snapTo.x, y: snapTo.y };
    }
    const setVB = () => {
      var _a;
      const c = camRef.current;
      (_a = svgRef.current) == null ? void 0 : _a.setAttribute("viewBox", `${c.x - viewR} ${c.y - viewR} ${viewR * 2} ${viewR * 2}`);
    };
    useEffect(setVB, [sel]);
    const vb = `${camRef.current.x - viewR} ${camRef.current.y - viewR} ${viewR * 2} ${viewR * 2}`;
    const onDown = useCallback((e) => {
      const svg = e.currentTarget, rect = svg.getBoundingClientRect();
      const scale = viewR * 2 / rect.width;
      dragRef.current = { sx: e.clientX, sy: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
      const onMove = (ev) => {
        const d = dragRef.current;
        if (!d) return;
        camRef.current = { x: d.cx - (ev.clientX - d.sx) * scale, y: d.cy - (ev.clientY - d.sy) * scale };
        setVB();
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }, [viewR]);
    if (!treeId) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Wybierz drzewo z listy" });
    if (!nodes.length) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Zaimportuj paczkę bazową" });
    const visNodes = nodes.filter((n) => visible.has(String(n.data.nodeId)));
    const visEdges = edges.filter((e) => visible.has(e.from) && visible.has(e.to));
    return /* @__PURE__ */ jsxs(
      "svg",
      {
        ref: svgRef,
        viewBox: vb,
        style: { width: "100%", height: "100%", cursor: "grab", userSelect: "none", display: "block" },
        onMouseDown: onDown,
        children: [
          /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsxs("filter", { id: "glow", children: [
            /* @__PURE__ */ jsx("feGaussianBlur", { stdDeviation: "3", result: "blur" }),
            /* @__PURE__ */ jsxs("feMerge", { children: [
              /* @__PURE__ */ jsx("feMergeNode", { in: "blur" }),
              /* @__PURE__ */ jsx("feMergeNode", { in: "SourceGraphic" })
            ] })
          ] }) }),
          contextEdges.map((ce, i) => {
            const f = layout.get(ce.from), t = layout.get(ce.to);
            return f && t ? /* @__PURE__ */ jsx(
              "line",
              {
                x1: f.x,
                y1: f.y,
                x2: t.x,
                y2: t.y,
                stroke: "#f59e0b",
                strokeWidth: 2,
                opacity: ce.strength * 0.6,
                filter: "url(#glow)"
              },
              `ctx-${i}`
            ) : null;
          }),
          visEdges.map((e, i) => {
            const f = layout.get(e.from), t = layout.get(e.to);
            return f && t ? /* @__PURE__ */ jsx("line", { x1: f.x, y1: f.y, x2: t.x, y2: t.y, stroke: "#475569", strokeWidth: 1.5, opacity: 0.3 }, i) : null;
          }),
          visNodes.map((n) => {
            var _a;
            const nid = String(n.data.nodeId), p = layout.get(nid);
            if (!p) return null;
            const s = str(n), disc = discovered.has(nid), front = frontier.has(nid), mast = s >= 1;
            const r = mast ? 26 : disc ? 22 : 16;
            const bc = ((_a = branches[String(n.data.branch)]) == null ? void 0 : _a.color) || "#64748b";
            const fill = mast ? bc : disc ? bc + "80" : "#1e293b";
            return /* @__PURE__ */ jsxs("g", { onClick: () => {
              useNav.setState({ sel: n.id, phase: "detail" });
              sdk.shared.setState({ bq: { treeId, nodeId: nid, postId: n.id } });
            }, style: { cursor: "pointer" }, children: [
              focusNid === nid && /* @__PURE__ */ jsx("circle", { cx: p.x, cy: p.y, r: r + 8, fill: "none", stroke: "#fff", strokeWidth: 1, opacity: 0.3 }),
              sel === n.id && /* @__PURE__ */ jsx("circle", { cx: p.x, cy: p.y, r: r + 5, fill: "none", stroke: "#fff", strokeWidth: 2 }),
              /* @__PURE__ */ jsx("circle", { cx: p.x, cy: p.y, r, fill, stroke: mast ? "#fff" : front ? bc + "40" : bc, strokeWidth: 1.5 }),
              front && /* @__PURE__ */ jsx("circle", { cx: p.x, cy: p.y, r: r + 3, fill: "none", stroke: bc, strokeWidth: 1, strokeDasharray: "4 3", opacity: 0.5 }),
              /* @__PURE__ */ jsx("text", { x: p.x, y: p.y + 5, textAnchor: "middle", fill: disc ? "#fff" : "#64748b", fontSize: mast ? 14 : 10, children: mast ? "★" : disc ? Number(n.data.hits) : "?" }),
              /* @__PURE__ */ jsx("text", { x: p.x, y: p.y + r + 14, textAnchor: "middle", fill: disc ? "#e2e8f0" : "#475569", fontSize: 10, children: disc ? String(n.data.title).slice(0, 16) : "???" })
            ] }, n.id);
          })
        ]
      }
    );
  }
  function NodeDetail({ id }) {
    const node = store.usePost(id);
    if (!node) return null;
    const s = str(node);
    const contents = store.useChildren(id, "content");
    const hasContent = contents.some((c) => String(c.data.contentType) !== "quiz");
    const slideCount = contents.filter((c) => String(c.data.contentType) !== "quiz").length;
    return /* @__PURE__ */ jsx("div", { style: { flexShrink: 0, padding: "8px" }, children: /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
      /* @__PURE__ */ jsxs(ui.Row, { justify: "between", children: [
        /* @__PURE__ */ jsx(ui.Heading, { title: String(node.data.title) }),
        /* @__PURE__ */ jsxs(ui.Row, { gap: "sm", children: [
          /* @__PURE__ */ jsx(ui.Badge, { children: s >= 1 ? "★ Opanowane" : s > 0 ? "Odkryte" : "Nieznane" }),
          /* @__PURE__ */ jsx("span", { style: { cursor: "pointer" }, onClick: () => useNav.setState({ phase: "map", sel: null }), children: /* @__PURE__ */ jsx(X, { size: 14 }) })
        ] })
      ] }),
      hasContent && /* @__PURE__ */ jsxs(ui.Text, { muted: true, size: "sm", children: [
        slideCount,
        " slajdów do przeczytania"
      ] }),
      /* @__PURE__ */ jsxs(ui.Stack, { children: [
        /* @__PURE__ */ jsx(ui.Button, { size: "lg", color: "primary", block: true, onClick: () => {
          const treeId = useNav.getState().treeId;
          sdk.shared.setState({ bq: { treeId, nodeId: String(node.data.nodeId), postId: id } });
          sdk.useHostStore.setState({ activeId: "plugin-brain-quest-reader" });
        }, children: "Czytaj i odkrywaj" }),
        /* @__PURE__ */ jsxs(ui.Button, { size: "lg", color: "primary", outline: true, block: true, onClick: () => {
          const treeId = useNav.getState().treeId;
          sdk.shared.setState({ bq: { treeId, nodeId: String(node.data.nodeId), postId: id, challenge: true } });
          sdk.useHostStore.setState({ activeId: "plugin-brain-quest-arena" });
        }, children: [
          /* @__PURE__ */ jsx(Zap, { size: 14 }),
          " Arena"
        ] })
      ] })
    ] }) }) });
  }
  const DEFAULT_ORG = "BrainEduPlay";
  const loadTree = async (org, repo) => {
    try {
      const r = await fetch(`${GH_RAW}/${org}/${repo}/main/pack.json`);
      if (!r.ok) throw new Error(`GitHub: ${r.status}`);
      const seeds = JSON.parse(await r.text());
      const count = store.importJSON(seeds);
      sdk.log(`${repo} — ${count} rekordów`, "ok");
      const trees = store.getPosts("tree");
      const tree = trees.find((t) => String(t.data.title).toLowerCase().includes(repo.replace(/-/g, " ")));
      if (tree) generateContexts(tree.id);
    } catch (e) {
      sdk.log(String(e), "error");
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
          store.remove(tree.id);
          if (active) useNav.setState({ treeId: null, sel: null, phase: "map" });
        } })
      }
    );
  }
  function TreeList() {
    const { treeId } = useNav();
    const trees = store.usePosts("tree");
    if (!trees.length) return null;
    return /* @__PURE__ */ jsx(ui.Page, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
      /* @__PURE__ */ jsx(ui.Heading, { title: "Drzewa wiedzy" }),
      trees.map((t) => /* @__PURE__ */ jsx(TreeItem, { tree: t, active: treeId === t.id }, t.id))
    ] }) });
  }
  function Progress() {
    const { treeId } = useNav();
    const nodes = store.useChildren(treeId || "", "node");
    if (!treeId) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Wybierz drzewo" });
    const d = nodes.filter((n) => Number(n.data.hits) > 0);
    return /* @__PURE__ */ jsx(ui.Page, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
      /* @__PURE__ */ jsxs(ui.Stats, { children: [
        /* @__PURE__ */ jsx(ui.Stat, { label: "Odkryte", value: `${d.length}/${nodes.length}` }),
        /* @__PURE__ */ jsx(ui.Stat, { label: "Opanowane", value: nodes.filter((n) => str(n) >= 1).length })
      ] }),
      /* @__PURE__ */ jsx(ui.Divider, {}),
      d.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8).map((n) => /* @__PURE__ */ jsxs(ui.Row, { gap: "sm", children: [
        str(n) >= 1 ? /* @__PURE__ */ jsx(Star, { size: 12 }) : /* @__PURE__ */ jsx(Check, { size: 12 }),
        /* @__PURE__ */ jsx(ui.Text, { size: "sm", children: String(n.data.title) })
      ] }, n.id))
    ] }) });
  }
  function Center() {
    const { treeId, phase, sel } = useNav();
    const trees = store.usePosts("tree");
    useEffect(() => {
      if (!treeId && trees.length) useNav.setState({ treeId: trees[0].id });
    }, [treeId, trees.length]);
    if (!treeId && !trees.length) return /* @__PURE__ */ jsx(RepoPicker, {});
    if (!treeId) return null;
    return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }, children: [
      /* @__PURE__ */ jsx("div", { style: { flex: 1, minHeight: 0, overflow: "hidden" }, children: /* @__PURE__ */ jsx(SkillTree, {}) }),
      phase === "detail" && sel && /* @__PURE__ */ jsx(NodeDetail, { id: sel })
    ] });
  }
  sdk.registerView("bq.left", { slot: "left", component: TreeList });
  sdk.registerView("bq.center", { slot: "center", component: Center });
  sdk.registerView("bq.right", { slot: "right", component: Progress });
  return { id: "plugin-brain-quest", label: "BrainQuest", icon: Award, version: "0.4.0" };
};
export {
  plugin as default
};
