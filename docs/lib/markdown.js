/*
 * Tiny, dependency-free Markdown -> HTML renderer.
 * Deliberately minimal (headings, bold, italic, inline/one block code, links, lists,
 * paragraphs). All input is HTML-escaped first, so rendering operator-authored release
 * notes cannot inject markup/script. Exposes window.renderMarkdown(text).
 */
(function () {
  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function inline(text) {
    // links [text](http...) — only http/https allowed
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // inline code
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    // bold then italic
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    return text;
  }

  function render(md) {
    if (!md) return "";
    var src = escapeHtml(String(md).replace(/\r\n/g, "\n"));
    var lines = src.split("\n");
    var html = [];
    var i = 0;
    var inList = false;
    var inCode = false;

    function closeList() { if (inList) { html.push("</ul>"); inList = false; } }

    while (i < lines.length) {
      var line = lines[i];

      // fenced code block
      if (/^```/.test(line)) {
        if (!inCode) { closeList(); html.push("<pre><code>"); inCode = true; }
        else { html.push("</code></pre>"); inCode = false; }
        i++;
        continue;
      }
      if (inCode) { html.push(line); i++; continue; }

      // headings
      var h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        closeList();
        var level = h[1].length;
        html.push("<h" + level + ">" + inline(h[2]) + "</h" + level + ">");
        i++;
        continue;
      }

      // unordered list item
      var li = line.match(/^\s*[-*]\s+(.*)$/);
      if (li) {
        if (!inList) { html.push("<ul>"); inList = true; }
        html.push("<li>" + inline(li[1]) + "</li>");
        i++;
        continue;
      }

      // blank line
      if (/^\s*$/.test(line)) { closeList(); i++; continue; }

      // paragraph
      closeList();
      html.push("<p>" + inline(line) + "</p>");
      i++;
    }
    if (inCode) html.push("</code></pre>");
    closeList();
    return html.join("\n");
  }

  window.renderMarkdown = render;
})();
