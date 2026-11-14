/**
 * Console scripts the writer runs on the page they are writing for (F12, paste, Enter); each copies a capture to the
 * clipboard to paste into the setup panel. Reddit and Discord are the app's own (libiamo-fullstack
 * `lib/admin/capture-scripts.ts`); the AO3 one also takes the whole work and its notes, which a rehearsal needs and a
 * scenario does not. Plain strings, since the page runs them as they are.
 */

const REDDIT = `(async (toClipboard) => {
  const url = location.origin + location.pathname.replace(/\\/$/, "") + ".json?limit=500&raw_json=1&sort=old";
  const listing = await (await fetch(url)).json();
  done(toClipboard, JSON.stringify(listing), "the post and " + listing[1].data.children.length + " top-level comments");
})(copy);`;

const AO3 = `(async (toClipboard) => {
  const work = location.pathname.match(/\\/works\\/\\d+/)[0];
  const load = async (query) => {
    // AO3 answers bursts with 429 "Retry later": wait and try again.
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetch(work + "?view_adult=true&view_full_work=true" + query);
      if (response.ok) return new DOMParser().parseFromString(await response.text(), "text/html");
      if (attempt === 6) throw new Error("AO3 keeps refusing (" + response.status + "); try again later.");
      const wait = Number(response.headers.get("retry-after")) || attempt * 10;
      console.log("AO3 asked to slow down; retrying in " + wait + "s…");
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    }
  };
  // Paragraphs keep their breaks; glued together they would read as the writer's mistakes.
  const clean = (el) => el ? [...el.querySelectorAll("p, li")].map((p) => p.textContent.trim()).filter(Boolean).join("\\n\\n") || el.textContent.trim() : "";
  const tags = (doc, kind) => [...doc.querySelectorAll("dd." + kind + " a.tag")].map((a) => a.textContent.trim());
  const first = await load("&show_comments=true&page=1");
  const pages = Math.max(1, ...[...first.querySelectorAll("#comments_placeholder .pagination a")].map((a) => Number(new URL(a.href, location.origin).searchParams.get("page")) || 1));
  const messages = new Map();
  for (let page = 1; page <= pages; page += 1) {
    const doc = page === 1 ? first : await load("&show_comments=true&page=" + page);
    for (const li of doc.querySelectorAll("#comments_placeholder li.comment")) {
      const holder = li.parentElement.parentElement;
      const parent = holder.tagName === "LI" && holder.previousElementSibling?.classList.contains("comment") ? holder.previousElementSibling.id : null;
      const byline = li.querySelector("h4.byline");
      const author = (byline.querySelector(":scope > a") || byline.querySelector(":scope > span"))?.textContent.trim() || "Guest";
      const time = byline.querySelector(".posted")?.textContent.replace(/\\s+/g, " ").trim();
      if (author !== "Account Deleted") messages.set(li.id, { id: li.id, parent, author, text: clean(li.querySelector("blockquote.userstuff")), time });
    }
  }
  const chapters = [...first.querySelectorAll("#chapters > .chapter, #chapters")].filter((c, i, all) => c.id !== "chapters" || all.length === 1);
  const body = chapters.map((c) => [c.querySelector("h3.title")?.textContent.replace(/\\s+/g, " ").trim(), clean(c.querySelector(".userstuff[role=article]") || c.querySelector(".userstuff"))].filter(Boolean).join("\\n\\n")).join("\\n\\n* * *\\n\\n");
  const capture = {
    platform: "ao3",
    work: {
      title: first.querySelector("h2.title").textContent.trim(),
      author: [...first.querySelectorAll("h3.byline a[rel=author]")].map((a) => a.textContent.trim()).join(", "),
      rating: tags(first, "rating")[0],
      warnings: tags(first, "warning"),
      fandoms: tags(first, "fandom"),
      relationships: tags(first, "relationship"),
      characters: tags(first, "character"),
      additionalTags: tags(first, "freeform"),
      summary: clean(first.querySelector(".preface .summary blockquote")),
      notes: [...first.querySelectorAll(".preface .notes .userstuff, .end.notes .userstuff")].map(clean).filter(Boolean).join("\\n---\\n"),
      body,
    },
    messages: [...messages.values()].sort((a, b) => Number(a.id.split("_")[1]) - Number(b.id.split("_")[1])),
  };
  done(toClipboard, JSON.stringify(capture), capture.work.title + " (" + body.split(/\\s+/).length + " words) and " + capture.messages.length + " comments");
})(copy);`;

const DISCORD = `((toClipboard) => {
  // The tab title reads "(unread) Discord | #channel | Server".
  const title = document.title.split(" | ");
  const channel = title.findIndex((part) => part.startsWith("#"));
  let author = "";
  const messages = [...document.querySelectorAll("li[id^=chat-messages-]")].map((li) => {
    const id = li.id.split("-").pop();
    author = li.querySelector("[id^=message-username-] [class*=username]")?.textContent.trim() || author;
    const quoted = li.querySelector("[id^=message-reply-context-] [id^=message-content-]");
    return {
      id,
      parent: quoted ? quoted.id.split("-").pop() : null,
      author,
      text: (document.getElementById("message-content-" + id)?.innerText || "").replace(/\\s*\\(edited\\)[\\s\\S]*$/, "").trim(),
      time: li.querySelector("time")?.getAttribute("datetime") || undefined,
    };
  }).filter((message) => message.text);
  const capture = { platform: "discord", serverName: title[channel + 1] || "", channelName: (title[channel] || "").slice(1), messages };
  done(toClipboard, JSON.stringify(capture), messages.length + " messages from #" + capture.channelName);
})(copy);`;

const DONE = `function done(toClipboard, json, what) {
  window.libiamoCapture = json;
  try {
    toClipboard(json);
    console.log("Copied " + what + ". Paste it into the scenario form.");
  } catch {
    console.log("Captured " + what + ", but copying failed: run copy(libiamoCapture).");
  }
}
`;

export const CAPTURE_SCRIPTS = { ao3: DONE + AO3, reddit: DONE + REDDIT, discord: DONE + DISCORD } as const;
