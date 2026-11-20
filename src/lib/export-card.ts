import type {
  CardLayout,
  ChatMessage,
  DeskObject,
  Locale,
  Skin,
} from "./ai/types";
import { loadImage } from "./crop-avatars";

interface CardPalette {
  bg: string;
  sheet: string;
  surface: string;
  ink: string;
  muted: string;
  rule: string;
  accent: string;
  bubbleIn: string;
  bubbleOut: string;
  bubbleOutText: string;
}

const PALETTES: Record<Skin, CardPalette> = {
  gallery: {
    bg: "#FFFFFF",
    sheet: "#FCFCFB",
    surface: "#F4F4F2",
    ink: "#111111",
    muted: "#6E6E73",
    rule: "rgba(0, 0, 0, 0.08)",
    accent: "#E5484D",
    bubbleIn: "#F4F4F2",
    bubbleOut: "#111111",
    bubbleOutText: "#FFFFFF",
  },
  message: {
    bg: "#F2F2EE",
    sheet: "#F8F8F5",
    surface: "#E7E6E0",
    ink: "#111111",
    muted: "#6E6E73",
    rule: "rgba(0, 0, 0, 0.08)",
    accent: "#E5484D",
    bubbleIn: "#FFFFFF",
    bubbleOut: "#111111",
    bubbleOutText: "#FFFFFF",
  },
  dark: {
    bg: "#0A0A0A",
    sheet: "#131315",
    surface: "#1B1C20",
    ink: "#FAFAFA",
    muted: "#8B8F96",
    rule: "rgba(255, 255, 255, 0.09)",
    accent: "#FF5A4E",
    bubbleIn: "#1A1B1F",
    bubbleOut: "#FFFFFF",
    bubbleOutText: "#0A0A0A",
  },
};

interface RichSpan {
  text: string;
  isAccent: boolean;
}

function buildMentionRegex(objectNames: string[]): RegExp {
  const sorted = [...objectNames]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return sorted.length > 0
    ? new RegExp(`(@(?:${sorted.join("|")})|@[\\w\\u4e00-\\u9fa5\\-·]+)`, "g")
    : /(@[\w\u4e00-\u9fa5\-·]+)/g;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    const tokens = para.match(/(\s+|[A-Za-z0-9@._\-/'’]+|.)/g) || [];
    let current = "";
    for (const token of tokens) {
      if (!current && /^\s+$/.test(token)) continue;
      const next = current + token;
      if (ctx.measureText(next).width > maxWidth && current.length > 0) {
        lines.push(current.trimEnd());
        current = /^\s+$/.test(token) ? "" : token;
      } else {
        current = next;
      }
    }
    if (current.trimEnd()) lines.push(current.trimEnd());
  }
  return lines.length > 0 ? lines : [""];
}

function wrapRichLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  objectNames: string[]
): RichSpan[][] {
  const pattern = buildMentionRegex(objectNames);
  const paragraphs = text.split("\n");
  const lines: RichSpan[][] = [];

  for (const para of paragraphs) {
    const segments = para.split(pattern);
    const atomicTokens: RichSpan[] = [];
    for (const seg of segments) {
      if (!seg) continue;
      const isAccent = seg.startsWith("@");
      const sub = seg.match(/(\s+|[A-Za-z0-9@._\-/'’]+|.)/g) || [];
      for (const tok of sub) {
        atomicTokens.push({ text: tok, isAccent });
      }
    }

    let currentLine: RichSpan[] = [];
    let currentWidth = 0;

    const pushCurrentLine = () => {
      // Trim trailing whitespace token
      while (
        currentLine.length > 0 &&
        /^\s+$/.test(currentLine[currentLine.length - 1].text)
      ) {
        currentLine.pop();
      }
      // Coalesce adjacent spans with same accent flag
      const merged: RichSpan[] = [];
      for (const span of currentLine) {
        const last = merged[merged.length - 1];
        if (last && last.isAccent === span.isAccent) {
          last.text += span.text;
        } else {
          merged.push({ ...span });
        }
      }
      lines.push(merged);
      currentLine = [];
      currentWidth = 0;
    };

    for (const tok of atomicTokens) {
      if (currentLine.length === 0 && /^\s+$/.test(tok.text)) continue;
      const tokW = ctx.measureText(tok.text).width;
      if (currentWidth + tokW > maxWidth && currentLine.length > 0) {
        pushCurrentLine();
        if (/^\s+$/.test(tok.text)) continue;
      }
      currentLine.push(tok);
      currentWidth += tokW;
    }
    if (currentLine.length > 0) {
      pushCurrentLine();
    }
  }

  return lines.length > 0 ? lines : [[{ text: "", isAccent: false }]];
}

function drawRichTextLines(
  ctx: CanvasRenderingContext2D,
  lines: RichSpan[][],
  x: number,
  startY: number,
  lineHeight: number,
  baseColor: string,
  accentColor: string
) {
  lines.forEach((line, i) => {
    let curX = x;
    const baselineY = startY + i * lineHeight;
    for (const span of line) {
      ctx.fillStyle = span.isAccent ? accentColor : baseColor;
      ctx.fillText(span.text, curX, baselineY);
      curX += ctx.measureText(span.text).width;
    }
  });
}

function measureRichLineWidth(
  ctx: CanvasRenderingContext2D,
  line: RichSpan[]
): number {
  return line.reduce((sum, s) => sum + ctx.measureText(s.text).width, 0);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPhotoWithPins(params: {
  ctx: CanvasRenderingContext2D;
  deskImg: HTMLImageElement;
  avatarMap: Map<string, HTMLImageElement>;
  objects: DeskObject[];
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  pinR: number;
  ruleColor: string;
}) {
  const { ctx, deskImg, avatarMap, objects, x, y, w, h, radius, pinR, ruleColor } =
    params;

  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.clip();

  const scale = Math.max(w / deskImg.naturalWidth, h / deskImg.naturalHeight);
  const drawW = deskImg.naturalWidth * scale;
  const drawH = deskImg.naturalHeight * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;
  ctx.drawImage(deskImg, drawX, drawY, drawW, drawH);

  for (const obj of objects.filter((o) => !o.removed)) {
    const [ymin, xmin, ymax, xmax] = obj.box_2d;
    const cx = drawX + ((xmin + xmax) / 2000) * drawW;
    const cy = drawY + ((ymin + ymax) / 2000) * drawH;
    const clampedCx = Math.max(x + pinR + 10, Math.min(x + w - pinR - 10, cx));
    const clampedCy = Math.max(y + pinR + 10, Math.min(y + h - pinR - 10, cy));

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.32)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(clampedCx, clampedCy, pinR + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const avImg = avatarMap.get(obj.id);
    if (avImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(clampedCx, clampedCy, pinR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avImg, clampedCx - pinR, clampedCy - pinR, pinR * 2, pinR * 2);
      ctx.restore();
    }
  }
  ctx.restore();

  ctx.strokeStyle = ruleColor;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.stroke();
}

function drawReactionChip(
  ctx: CanvasRenderingContext2D,
  reaction: string,
  x: number,
  y: number,
  p: CardPalette
) {
  ctx.save();
  ctx.fillStyle = p.surface;
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, 42, 28, 14);
  ctx.fill();
  ctx.stroke();
  ctx.font = `500 16px sans-serif`;
  ctx.fillStyle = p.ink;
  ctx.fillText(reaction, x + 10, y + 20);
  ctx.restore();
}

export async function renderShareCardCanvas(params: {
  imageSrc: string;
  groupName: string;
  resentmentScore: number;
  mostLikelyToLeave: string;
  objects: DeskObject[];
  messages: ChatMessage[];
  skin: Skin;
  layout?: CardLayout;
  locale: Locale;
}): Promise<HTMLCanvasElement> {
  const {
    imageSrc,
    groupName,
    resentmentScore,
    mostLikelyToLeave,
    objects,
    messages,
    skin,
    layout = "landscape",
    locale,
  } = params;

  const p = PALETTES[skin];
  const useBubbles = skin === "message";
  const fontStack = `"Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei UI", sans-serif`;
  const objectNames = objects.map((o) => o.name);

  const deskImg = await loadImage(imageSrc);
  const avatarMap = new Map<string, HTMLImageElement>();
  await Promise.all(
    objects.map(async (obj) => {
      if (obj.avatarUrl) {
        try {
          avatarMap.set(obj.id, await loadImage(obj.avatarUrl));
        } catch {
          // ignore
        }
      }
    })
  );

  // =========================================================================
  // LANDSCAPE 16:9 CARD (1600x900) — Uncropped X Timeline Hero Layout
  // =========================================================================
  if (layout === "landscape") {
    const W = 1600;
    const H = 900;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, W, H);

    const LX = 52;
    const LW = 816;
    const RX = 904;
    const RW = 644;

    // Left Column Header
    ctx.fillStyle = p.ink;
    ctx.font = `700 32px ${fontStack}`;
    const titleLines = wrapTextLines(ctx, groupName, LW - 170);
    ctx.fillText(titleLines[0], LX, 80);

    const scoreLabel = `${locale === "zh" ? "怨气" : "Tension"} ${resentmentScore}%`;
    ctx.font = `600 20px ${fontStack}`;
    const scoreW = ctx.measureText(scoreLabel).width;
    ctx.fillStyle = p.accent;
    ctx.fillText(scoreLabel, LX + LW - scoreW, 78);

    ctx.fillStyle = p.muted;
    ctx.font = `500 18px ${fontStack}`;
    ctx.fillText(
      `${objects.filter((o) => !o.removed).length} ${
        locale === "zh" ? "个桌面成员正在背后群聊" : "items in secret group chat"
      }`,
      LX,
      114
    );

    // Left Framed Desk Photo
    drawPhotoWithPins({
      ctx,
      deskImg,
      avatarMap,
      objects,
      x: LX,
      y: 142,
      w: LW,
      h: 616,
      radius: 24,
      pinR: 22,
      ruleColor: p.rule,
    });

    // Left Footer
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(LX, 792);
    ctx.lineTo(LX + LW, 792);
    ctx.stroke();

    ctx.fillStyle = p.muted;
    ctx.font = `500 19px ${fontStack}`;
    ctx.fillText(
      `${locale === "zh" ? "最想跑路：" : "First to quit: "}${mostLikelyToLeave}`,
      LX,
      834
    );

    const brandLabel = "DeskTea · Built with Gemini";
    ctx.fillStyle = p.ink;
    ctx.font = `600 19px ${fontStack}`;
    const brandW = ctx.measureText(brandLabel).width;
    ctx.fillText(brandLabel, LX + LW - brandW, 834);

    // Right Column Elevated Chat Panel
    const PY = 48;
    const PH = 804;
    ctx.fillStyle = p.sheet;
    drawRoundedRect(ctx, RX, PY, RW, PH, 24);
    ctx.fill();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, RX, PY, RW, PH, 24);
    ctx.stroke();

    const RPAD = 32;
    const innerX = RX + RPAD;
    const innerW = RW - RPAD * 2;

    ctx.fillStyle = p.muted;
    ctx.font = `600 17px ${fontStack}`;
    ctx.fillText(
      locale === "zh" ? "截获对话节选" : "LEAKED TRANSCRIPT",
      innerX,
      PY + 44
    );

    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    ctx.moveTo(innerX, PY + 64);
    ctx.lineTo(innerX + innerW, PY + 64);
    ctx.stroke();

    let cy = PY + 84;
    const maxY = PY + PH - 20;
    const bodyFont = `500 19.5px ${fontStack}`;
    const lineHeight = 27;

    for (const m of messages) {
      if (m.isSystem) {
        ctx.font = `500 16px ${fontStack}`;
        const sysH = 34;
        if (cy + sysH > maxY) break;
        const sysW = Math.min(innerW, ctx.measureText(m.text).width + 28);
        const sysX = RX + (RW - sysW) / 2;
        ctx.fillStyle = p.surface;
        drawRoundedRect(ctx, sysX, cy, sysW, 30, 15);
        ctx.fill();
        ctx.fillStyle = p.accent;
        ctx.fillText(m.text, sysX + 14, cy + 21);
        cy += sysH + 10;
        continue;
      }

      ctx.font = bodyFont;
      const textColW = innerW - 96;
      const richLines = wrapRichLines(ctx, m.text, textColW, objectNames);
      const reactionH = m.reaction ? 30 : 0;
      const bubblePad = useBubbles ? 22 : 4;
      const rowH = Math.max(54, richLines.length * lineHeight + 28 + bubblePad + reactionH);

      if (cy + rowH > maxY) break;

      const isOwner = Boolean(m.isOwner);
      if (isOwner) {
        const bubbleW = Math.min(
          innerW - 70,
          Math.max(...richLines.map((l) => measureRichLineWidth(ctx, l))) + 38
        );
        const bubbleH = richLines.length * lineHeight + 20;
        const bx = innerX + innerW - bubbleW;

        ctx.fillStyle = p.muted;
        ctx.font = `500 16px ${fontStack}`;
        const ownerLbl = locale === "zh" ? "你（主人）" : "You (Owner)";
        const lblW = ctx.measureText(ownerLbl).width;
        ctx.fillText(ownerLbl, innerX + innerW - lblW, cy + 15);

        ctx.fillStyle = p.bubbleOut;
        drawRoundedRect(ctx, bx, cy + 22, bubbleW, bubbleH, 16);
        ctx.fill();

        ctx.font = bodyFont;
        drawRichTextLines(
          ctx,
          richLines,
          bx + 19,
          cy + 48,
          lineHeight,
          p.bubbleOutText,
          p.accent
        );
      } else {
        const avSize = 44;
        const avImg = avatarMap.get(m.senderId);
        ctx.save();
        ctx.beginPath();
        ctx.arc(innerX + avSize / 2, cy + avSize / 2 + 2, avSize / 2, 0, Math.PI * 2);
        ctx.clip();
        if (avImg) {
          ctx.drawImage(avImg, innerX, cy + 2, avSize, avSize);
        } else {
          ctx.fillStyle = p.surface;
          ctx.fillRect(innerX, cy + 2, avSize, avSize);
        }
        ctx.restore();

        const tx = innerX + avSize + 14;
        ctx.fillStyle = p.muted;
        ctx.font = `600 16px ${fontStack}`;
        ctx.fillText(`${m.senderName}  ${m.timestamp}`, tx, cy + 16);

        if (useBubbles) {
          ctx.font = bodyFont;
          const bubbleW = Math.min(
            innerW - 70,
            Math.max(...richLines.map((l) => measureRichLineWidth(ctx, l))) + 34
          );
          const bubbleH = richLines.length * lineHeight + 20;
          ctx.fillStyle = p.bubbleIn;
          drawRoundedRect(ctx, tx, cy + 24, bubbleW, bubbleH, 16);
          ctx.fill();
          drawRichTextLines(ctx, richLines, tx + 17, cy + 49, lineHeight, p.ink, p.accent);
          if (m.reaction) {
            drawReactionChip(ctx, m.reaction, tx, cy + 24 + bubbleH + 5, p);
          }
        } else {
          ctx.font = bodyFont;
          drawRichTextLines(ctx, richLines, tx, cy + 44, lineHeight, p.ink, p.accent);
          if (m.reaction) {
            drawReactionChip(
              ctx,
              m.reaction,
              tx,
              cy + 44 + (richLines.length - 1) * lineHeight + 10,
              p
            );
          }
        }
      }

      cy += rowH + 10;
    }

    return canvas;
  }

  // =========================================================================
  // PORTRAIT CARD (1080xAUTO) — Tall Share Card
  // =========================================================================
  const W = 1080;
  const PAD = 64;
  const INNER_W = W - PAD * 2;

  const probe = document.createElement("canvas").getContext("2d")!;
  const bodyFont = `500 26px ${fontStack}`;
  probe.font = bodyFont;
  const textColWidth = INNER_W - 180;

  const rowLayouts = messages.map((m) => {
    const richLines = wrapRichLines(probe, m.text, textColWidth, objectNames);
    const lineHeight = 38;
    const textHeight = richLines.length * lineHeight;
    const reactionExtra = !m.isOwner && !m.isSystem && m.reaction ? 36 : 0;
    const height = m.isSystem
      ? 52
      : Math.max(92, textHeight + 70 + reactionExtra);
    return { message: m, richLines, lineHeight, height };
  });

  const imgRatio = deskImg.naturalHeight / Math.max(1, deskImg.naturalWidth);
  const photoW = INNER_W;
  const photoH = Math.min(
    580,
    Math.max(380, Math.round(photoW * Math.min(0.75, Math.max(0.54, imgRatio))))
  );

  const headerH = 112;
  const photoBlockH = photoH + 40;
  const chatBodyH = rowLayouts.reduce((acc, r) => acc + r.height + 16, 0);
  const footerH = 132;
  const totalH = PAD + headerH + photoBlockH + chatBodyH + footerH + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, totalH);

  let y = PAD;

  ctx.fillStyle = p.ink;
  ctx.font = `700 40px ${fontStack}`;
  const titleLines = wrapTextLines(ctx, groupName, INNER_W - 180);
  ctx.fillText(titleLines[0], PAD, y + 36);

  const scoreLabel = `${locale === "zh" ? "怨气" : "Tension"} ${resentmentScore}%`;
  ctx.font = `600 22px ${fontStack}`;
  const scoreW = ctx.measureText(scoreLabel).width;
  ctx.fillStyle = p.accent;
  ctx.fillText(scoreLabel, W - PAD - scoreW, y + 32);

  ctx.fillStyle = p.muted;
  ctx.font = `500 20px ${fontStack}`;
  ctx.fillText(
    `${objects.filter((o) => !o.removed).length} ${
      locale === "zh" ? "个桌面成员正在背后群聊" : "objects in secret group chat"
    }`,
    PAD,
    y + 76
  );

  y += headerH;

  drawPhotoWithPins({
    ctx,
    deskImg,
    avatarMap,
    objects,
    x: PAD,
    y,
    w: photoW,
    h: photoH,
    radius: 24,
    pinR: 26,
    ruleColor: p.rule,
  });

  y += photoH + 40;

  for (const row of rowLayouts) {
    const m = row.message;

    if (m.isSystem) {
      ctx.font = `500 20px ${fontStack}`;
      const sysW = ctx.measureText(m.text).width + 36;
      const sysX = (W - sysW) / 2;
      ctx.fillStyle = p.surface;
      drawRoundedRect(ctx, sysX, y + 4, sysW, 40, 20);
      ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.fillText(m.text, sysX + 18, y + 31);
      y += row.height + 16;
      continue;
    }

    const avatarSize = 60;
    const avatarImg = avatarMap.get(m.senderId);
    const isOwner = Boolean(m.isOwner);

    if (isOwner) {
      ctx.font = bodyFont;
      const bubbleW = Math.min(
        INNER_W - 120,
        Math.max(...row.richLines.map((l) => measureRichLineWidth(ctx, l))) + 44
      );
      const bubbleH = row.richLines.length * row.lineHeight + 30;
      const bx = W - PAD - bubbleW;

      ctx.fillStyle = p.muted;
      ctx.font = `500 19px ${fontStack}`;
      const ownerLbl = locale === "zh" ? "你（主人）" : "You (Owner)";
      const lblW = ctx.measureText(ownerLbl).width;
      ctx.fillText(ownerLbl, W - PAD - lblW, y + 18);

      ctx.fillStyle = p.bubbleOut;
      drawRoundedRect(ctx, bx, y + 30, bubbleW, bubbleH, 20);
      ctx.fill();

      ctx.font = bodyFont;
      drawRichTextLines(
        ctx,
        row.richLines,
        bx + 22,
        y + 64,
        row.lineHeight,
        p.bubbleOutText,
        p.accent
      );
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(PAD + avatarSize / 2, y + avatarSize / 2 + 8, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      if (avatarImg) {
        ctx.drawImage(avatarImg, PAD, y + 8, avatarSize, avatarSize);
      } else {
        ctx.fillStyle = p.surface;
        ctx.fillRect(PAD, y + 8, avatarSize, avatarSize);
      }
      ctx.restore();

      const textX = PAD + avatarSize + 20;
      ctx.fillStyle = p.muted;
      ctx.font = `600 20px ${fontStack}`;
      ctx.fillText(`${m.senderName}  ${m.timestamp}`, textX, y + 20);

      if (useBubbles) {
        ctx.font = bodyFont;
        const bubbleW = Math.min(
          INNER_W - 104,
          Math.max(...row.richLines.map((l) => measureRichLineWidth(ctx, l))) + 44
        );
        const bubbleH = row.richLines.length * row.lineHeight + 28;
        ctx.fillStyle = p.bubbleIn;
        drawRoundedRect(ctx, textX, y + 32, bubbleW, bubbleH, 20);
        ctx.fill();

        drawRichTextLines(
          ctx,
          row.richLines,
          textX + 22,
          y + 66,
          row.lineHeight,
          p.ink,
          p.accent
        );
        if (m.reaction) {
          drawReactionChip(ctx, m.reaction, textX, y + 32 + bubbleH + 8, p);
        }
      } else {
        ctx.font = bodyFont;
        drawRichTextLines(
          ctx,
          row.richLines,
          textX,
          y + 58,
          row.lineHeight,
          p.ink,
          p.accent
        );
        if (m.reaction) {
          drawReactionChip(
            ctx,
            m.reaction,
            textX,
            y + 58 + (row.richLines.length - 1) * row.lineHeight + 14,
            p
          );
        }
      }
    }

    y += row.height + 16;
  }

  y += 16;
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  y += 46;
  ctx.fillStyle = p.muted;
  ctx.font = `500 21px ${fontStack}`;
  ctx.fillText(
    `${locale === "zh" ? "最想跑路：" : "First to quit: "}${mostLikelyToLeave}`,
    PAD,
    y
  );

  const brandText = "DeskTea · Built with Gemini";
  ctx.fillStyle = p.ink;
  ctx.font = `600 22px ${fontStack}`;
  const brandW = ctx.measureText(brandText).width;
  ctx.fillText(brandText, W - PAD - brandW, y);

  return canvas;
}

export function downloadCardPng(canvas: HTMLCanvasElement, filename = "desktea-card.png") {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export async function copyCardToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    return false;
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  return true;
}
