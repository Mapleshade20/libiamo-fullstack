/**
 * Console scripts that capture a real conversation from its page in the capture format of
 * `capture.ts`. Pasted into the browser's developer console (F12) on the page, each copies the
 * capture to the clipboard with the console's `copy`. That helper exists only while the pasted code
 * starts running, so each script takes it as an argument before its first `await`, and also leaves
 * the capture in `libiamoCapture` in case copying fails. They are plain strings, since the page runs
 * them as they are.
 */

/** Reddit: the post's own JSON, fetched with the reader's session (up to 500 comments). */
const REDDIT = `(async (toClipboard) => {
  const url = location.origin + location.pathname.replace(/\\/$/, "") + ".json?limit=500&raw_json=1&sort=old";
  const listing = await (await fetch(url)).json();
  done(toClipboard, JSON.stringify(listing), "the post and " + listing[1].data.children.length + " top-level comments");
})(copy);`;

/** AO3: one chapter (the one open, or a one-shot work) with its details and comments, oldest first. */
const AO3 = `(async (toClipboard) => {
  const chapter = location.pathname.match(/\\/works\\/\\d+(\\/chapters\\/\\d+)?/)[0];
  const load = async (page) => {
    // AO3 answers bursts with 429 "Retry later": wait and try again.
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetch(chapter + "?view_adult=true&show_comments=true&page=" + page);
      if (response.ok) return new DOMParser().parseFromString(await response.text(), "text/html");
      if (attempt === 6) throw new Error("AO3 keeps refusing page " + page + " (" + response.status + "); try again later.");
      const wait = Number(response.headers.get("retry-after")) || attempt * 10;
      console.log("AO3 asked to slow down; retrying page " + page + " in " + wait + "s…");
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    }
  };
  const clean = (el) => el ? [...el.querySelectorAll("p")].map((p) => p.textContent.trim()).filter(Boolean).join("\\n") || el.textContent.trim() : "";
  const tags = (doc, kind) => [...doc.querySelectorAll("dd." + kind + " a.tag")].map((a) => a.textContent.trim());
  const first = await load(1);
  const pages = Math.max(1, ...[...first.querySelectorAll("#comments_placeholder .pagination a")].map((a) => Number(new URL(a.href, location.origin).searchParams.get("page")) || 1));
  const messages = new Map();
  for (let page = 1; page <= pages; page += 1) {
    const doc = page === 1 ? first : await load(page);
    for (const li of doc.querySelectorAll("#comments_placeholder li.comment")) {
      const holder = li.parentElement.parentElement;
      const parent = holder.tagName === "LI" && holder.previousElementSibling?.classList.contains("comment") ? holder.previousElementSibling.id : null;
      const byline = li.querySelector("h4.byline");
      // A guest has no profile link: their name is the first span, before "(Guest)".
      const author = (byline.querySelector(":scope > a") || byline.querySelector(":scope > span"))?.textContent.trim() || "Guest";
      const time = byline.querySelector(".posted")?.textContent.replace(/\\s+/g, " ").trim();
      if (author !== "Account Deleted") messages.set(li.id, { id: li.id, parent, author, text: clean(li.querySelector("blockquote.userstuff")), time });
    }
  }
  const capture = {
    platform: "ao3",
    work: {
      title: first.querySelector("h2.title").textContent.trim(),
      chapter: first.querySelector("#chapters h3.title")?.textContent.replace(/\\s+/g, " ").trim(),
      author: [...first.querySelectorAll("h3.byline a[rel=author]")].map((a) => a.textContent.trim()).join(", "),
      rating: tags(first, "rating")[0],
      warnings: tags(first, "warning"),
      categories: tags(first, "category"),
      fandoms: tags(first, "fandom"),
      relationships: tags(first, "relationship"),
      characters: tags(first, "character"),
      additionalTags: tags(first, "freeform"),
      summary: clean(first.querySelector(".preface .summary blockquote")),
      excerpt: clean(first.querySelector("#chapters .userstuff[role=article], #chapters > .userstuff")).slice(0, 2000),
      stats: Object.fromEntries(["published", "status", "words", "chapters", "comments", "kudos", "bookmarks", "hits"]
        .map((kind) => [kind === "status" ? "updated" : kind, first.querySelector("dl.stats dd." + kind)?.textContent.trim()])
        .filter(([, value]) => value)),
    },
    messages: [...messages.values()].sort((a, b) => Number(a.id.split("_")[1]) - Number(b.id.split("_")[1])),
  };
  done(toClipboard, JSON.stringify(capture), capture.work.title + " and " + capture.messages.length + " comments");
})(copy);`;

/** Discord: the channel's messages currently loaded, so scroll up first to load the history you want. */
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

/** Copies the capture, keeping it in `libiamoCapture` as well. */
const DONE = `function done(toClipboard, json, what) {
  window.libiamoCapture = json;
  try {
    toClipboard(json);
    console.log("Copied " + what + ". Paste it into the task form.");
  } catch {
    console.log("Captured " + what + ", but copying failed: run copy(libiamoCapture).");
  }
}
`;

export const CAPTURE_SCRIPTS = { reddit: DONE + REDDIT, ao3: DONE + AO3, discord: DONE + DISCORD } as const;

export type CapturePlatform = keyof typeof CAPTURE_SCRIPTS;
