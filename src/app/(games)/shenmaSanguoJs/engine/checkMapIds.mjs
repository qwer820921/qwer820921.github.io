(async () => {
  try {
    const res = await fetch("http://127.0.0.1:9225/json/list").catch(() => null);
    if (!res) {
      console.log("No Chrome CDP on 9225");
      return;
    }
    const pages = await res.json();
    const wsUrl = pages[0].webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);
    await new Promise((r) => (ws.onopen = r));
    ws.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          expression: `(() => {
            const raw = localStorage.getItem("shenma_static_config");
            if (!raw) return "no static config in localStorage";
            const p = JSON.parse(raw);
            return p.maps.slice(0, 15).map(m => ({
              map_id: m.map_id,
              chapter: m.chapter,
              name: m.name,
              unlock_stage: m.unlock_stage
            }));
          })()`,
          returnByValue: true,
        },
      })
    );
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log(JSON.stringify(data.result?.result?.value, null, 2));
      ws.close();
    };
  } catch (err) {
    console.error(err);
  }
})();
