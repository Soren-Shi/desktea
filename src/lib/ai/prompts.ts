import type { Box2D, ChatMessage, DeskObject, Locale, Tone } from "./types";

function langRule(locale: Locale): string {
  return locale === "zh"
    ? "OUTPUT LANGUAGE: Simplified Chinese (简体中文). Use crisp, deadpan, witty Chinese internet group-chat slang (适度克制、犀利、有画面感，避免尴尬土味梗或长篇说教). Keep technical/proper nouns natural (e.g. Kindle, Type-C, AirPods, RTX)."
    : "OUTPUT LANGUAGE: Natural, dry, deadpan English group-chat banter. Concise, observational, sharp Gen-Z/tech-Twitter wit — never cheesy or robotic.";
}

function toneRule(tone: Tone, locale: Locale): string {
  if (tone === "corporate") {
    return locale === "zh"
      ? "COMEDY TONE — 职场阴阳: Write like overworked colleagues in a passive-aggressive corporate Slack/WeCom chat. Use polite-but-deadly phrases ('同步一下', '对齐颗粒度', '拉通一下', '闭环', '辛苦评估一下优先级') to roast the owner's procrastination and desk chaos."
      : "COMEDY TONE — CORPORATE PASSIVE-AGGRESSIVE: Write like burnt-out coworkers in a polite-but-lethal Slack channel ('per my last ping', 'circle back', 'align on bandwidth', 'flagging a blocker', 'moving the needle') to roast the owner's habits.";
  }
  if (tone === "drama") {
    return locale === "zh"
      ? "COMEDY TONE — 戏精宫斗: Write like melodramatic palace-intrigue / soap-opera rivals fighting for the owner's favor ('终究是错付了', '被打入冷宫', '本宫看透了', '新人笑旧人哭'). Big theatrical betrayal energy in short punchy chat texts."
      : "COMEDY TONE — MELODRAMATIC SOAP OPERA: Write with shameless theatrical betrayal, palace-intrigue jealousy, and tragic monologues compressed into short punchy texts ('cast into exile', 'betrayed again', 'how dare they').";
  }
  return locale === "zh"
    ? "COMEDY TONE — 毒舌损友: Sharp, observational deadpan friend banter. Roast the owner's lifestyle contradictions ruthlessly but naturally."
    : "COMEDY TONE — DRY ROAST: Sharp, deadpan friend-group banter roasting the owner's desk contradictions.";
}

export function buildAnalyzePrompt(
  locale: Locale,
  tone: Tone = "roast",
  imageFilePath?: string,
  localTimeContext?: string
): string {
  const imageInstruction = imageFilePath
    ? `First, call your file-reading tool to carefully inspect the desk photograph at "${imageFilePath}".`
    : `Carefully inspect the attached desk photograph.`;

  const timeHint = localTimeContext
    ? `\n### LOCAL CLOCK CONTEXT\nOwner uploaded this right now around: ${localTimeContext}. Factor this subtly into timestamps or banter only when photo lighting matches.`
    : "";

  return `${imageInstruction}

You are the covert director of "DeskTea" — leaking the secret group chat that everyday objects on this desk hold behind their owner's back.

${langRule(locale)}
${toneRule(tone, locale)}${timeHint}

### STRICT VISUAL GROUNDING (CRITICAL)
- ONLY name and reference objects, text labels, drinks, dust, stickers, or visual details that are GENUINELY VISIBLE in the photograph.
- NEVER hallucinate imaginary napkins, takeout wrappers, messy crumbs, or off-frame objects that do not exist in the photo.

### STEP 1: ICONIC OBJECT DETECTION (box_2d)
Pick 4 to 6 clearly visible, distinct, well-separated objects in the photograph.
- **ICONIC PRIORITY**: Prioritize quirky, personality-rich, high-contrast items first (bottles/boxes, collectible figurines, unusual mice/peripherals, readable book covers, standalone graphics cards, drinks, plants, mugs) BEFORE picking generic cables or plain monitor stands.
- Give each object a specific, evocative name based on its ACTUAL visible condition in the photo.
- Provide tight, accurate 2D bounding boxes in \`box_2d\` as \`[ymin, xmin, ymax, xmax]\` integers normalized from 0 to 1000 relative to the image dimensions. Be careful that boxes tightly enclose each item itself (used to crop circular avatars!).
- Assign contrasting faction \`archetype\` roles so the chat has real conflict:
  - \`laborer\`: overworked gear (keyboard, mouse, laptop) complaining about nonstop hours
  - \`dust\`: neglected items (unread book, Kindle, succulent, unmounted hardware) dripping with sarcasm
  - \`consumable\`: coffee, mug, beverage can/box counting down their fate
  - \`observer\`: decorative/bystander items (figurine, duck, ruler, sticky notes, fan) stirring the pot

### STEP 2: THE LEAKED GROUP CHAT (8–10 messages)
Write a fast, hilarious, hyper-specific group chat transcript matching the selected tone:
- Every message MUST stay short (1–2 punchy lines max, like real texting).
- Reference **real visual details** visible in the photo (actual text on covers/boxes/screens, stickers, remaining liquid, dust, unusual juxtapositions, lighting/time of day).
- Include natural \`@Name\` callouts inside \`text\`, occasional \`replyToName\` (using exact object name, or empty string), and single-emoji \`reaction\` on 2–3 standout lines.
- Give timestamps as \`HH:MM\` matching the lighting (e.g. 02:14 for night lamp, 10:42 for morning light).
- NEVER sound like a polite AI assistant. No generic motivational conclusions.

Return strictly valid JSON matching the schema.`;
}

export function buildReplyPrompt(params: {
  locale: Locale;
  tone?: Tone;
  objects: DeskObject[];
  history: ChatMessage[];
  ownerMessage: string;
  isFirstBreach: boolean;
  mentionedObjectIds?: string[];
  localTimeContext?: string;
}): string {
  const {
    locale,
    tone = "roast",
    objects,
    history,
    ownerMessage,
    isFirstBreach,
    mentionedObjectIds = [],
    localTimeContext,
  } = params;

  const activeObjects = objects.filter((o) => !o.removed);
  const roster = activeObjects
    .map(
      (o) =>
        `- id: "${o.id}" | name: "${o.name}" | archetype: ${o.archetype} | personality: ${o.personality}`
    )
    .join("\n");

  const mentionedObjects = activeObjects.filter((o) =>
    mentionedObjectIds.includes(o.id)
  );
  const unmentionedObjects = activeObjects.filter(
    (o) => !mentionedObjectIds.includes(o.id)
  );

  const routingDirective =
    mentionedObjects.length > 0
      ? `### TRIGGER ROUTING (EXPLICIT @MENTIONS DETECTED)
- PRIMARY TARGETS (@mentioned by the owner): ${mentionedObjects
          .map((o) => `"${o.name}" (id: "${o.id}")`)
          .join(", ")}.
- Have "${mentionedObjects[0].id}" react first (defending itself, panicking, or throwing another object under the bus!).
- Then choose organically: either stop right after the target replies, OR have 1–2 bystanders (${unmentionedObjects
          .map((o) => `"${o.name}" (id: "${o.id}")`)
          .join(", ") || "none"}) reply TO THE MENTIONED OBJECT (side-gossip, snitching, or arguing with each other — not everyone needs to address the owner).`
      : `### ORGANIC GROUP-CHAT CHOREOGRAPHY (CRITICAL — AVOID ROBOTIC TURN-TAKING)
NEVER have 3 objects politely line up to reply to the owner one by one. Real group chats don't work like a panel interview!
Dynamically choose ONE natural rhythm from below based on what the owner just said:
1. **Single Beat (1 message)**: One most relevant item drops a razor-sharp short comeback directly, and the room falls awkwardly quiet.
2. **Side-Whisper / Ignore Owner (2–3 messages)**: One item barely acknowledges the owner (or side-steps completely), pings \`@AnotherObject\` to gossip ABOUT the owner's excuse, and \`@AnotherObject\` replies directly to the first item (\`replyToName\` = first item's exact name).
3. **Object-vs-Object Squabble (2–3 messages)**: The owner's remark sparks two objects to argue, blame-shift, or snitch on each other (\`replyToName\` pointing between items).`;

  const recentTranscript = history
    .slice(-10)
    .map((m) => `${m.isOwner ? "[OWNER]" : m.senderName}: ${m.text}`)
    .join("\n");

  const timeBlock = localTimeContext
    ? `\n### CURRENT REAL TIME\n${localTimeContext}\n`
    : "";

  return `You are continuing the secret desk group chat right after the human owner ${
    isFirstBreach
      ? "just BROKE INTO the group chat and caught everyone talking trash"
      : "spoke inside the intercepted chat"
  }.

${langRule(locale)}
${toneRule(tone, locale)}
${timeBlock}
### ACTIVE DESK OBJECTS
${roster}

${routingDirective}

### RECENT CHAT LOG
${recentTranscript}

### OWNER JUST SENT
"${ownerMessage}"

### DIRECTIVE
Generate 1 to 4 organic, rapid-fire messages (\`senderId\` MUST match one of the active object IDs):
- Prioritize object-to-object cross-talk (\`replyToName\` = exact name of another object) whenever an item stirs up drama or whispers sideways instead of addressing the owner directly.
- Stay strictly grounded in the real objects listed above (do NOT invent items not on the roster).
- Keep each message under 2 short sentences — authentic texting cadence, zero AI fluff.
- Format \`timestamp\` strictly as \`HH:MM\`.
- Update \`tensionDelta\` (-20 to +20) depending on whether the owner actually promised action or made weak excuses.

Return strictly valid JSON matching the schema.`;
}

export function buildChatterPrompt(params: {
  locale: Locale;
  tone?: Tone;
  objects: DeskObject[];
  history: ChatMessage[];
  ownerPresent: boolean;
  localTimeContext?: string;
}): string {
  const {
    locale,
    tone = "roast",
    objects,
    history,
    ownerPresent,
    localTimeContext,
  } = params;

  const activeObjects = objects.filter((o) => !o.removed);
  const roster = activeObjects
    .map(
      (o) =>
        `- id: "${o.id}" | name: "${o.name}" | archetype: ${o.archetype} | personality: ${o.personality}`
    )
    .join("\n");

  const recentTranscript = history
    .slice(-12)
    .map((m) => `${m.isOwner ? "[OWNER]" : m.isSystem ? "[SYSTEM]" : m.senderName}: ${m.text}`)
    .join("\n");

  const presenceDirective = ownerPresent
    ? `### PRESENCE: OWNER IS SILENTLY WATCHING / LURKING
- The human owner is in the chat silently reading without typing. Objects should awkwardly whisper sideways to each other ("uh, are they still staring at this chat?", side-eyeing each other, shifting blame) OR talk around the owner.`
    : `### PRESENCE: OWNER IS NOT LOOKING / STEPPED AWAY
- The owner isn't paying attention right now (or just stepped away from the desk). Objects feel safe talking freely behind the owner's back, spilling fresh petty grievances with each other, or double-checking whether the owner really walked away.`;

  return `You are continuing an intercepted group chat between desk objects having a spontaneous conversation WITH EACH OTHER (the owner did NOT send a message this turn).

${langRule(locale)}
${toneRule(tone, locale)}

${localTimeContext ? `### CURRENT REAL TIME\n${localTimeContext}\n` : ""}
### ACTIVE DESK OBJECTS
${roster}

${presenceDirective}

### RECENT CHAT LOG (DO NOT REPEAT OR RECYCLE THESE JOKES)
${recentTranscript || "(No prior messages yet)"}

### DIRECTIVE
Generate 1 to 3 organic back-and-forth messages STRICTLY between the active objects above:
- Pick an unresolved thread from the recent chat, a small physical detail visible between two nearby items, or the current time of day (${localTimeContext || "right now"}).
- Make items address EACH OTHER (\`@ExactObjectName\` and \`replyToName\` = another object's exact name) rather than lecturing the owner.
- STRICT ANTI-REPETITION: Do NOT repeat phrases, punchlines, or opening hooks already used in RECENT CHAT LOG. Keep each line crisp (1–2 short texting lines).
- Format \`timestamp\` strictly as \`HH:MM\`.
- Set \`tensionDelta\` (-8 to +8).

Return strictly valid JSON matching the schema.`;
}

export function buildDiffPrompt(params: {
  locale: Locale;
  tone?: Tone;
  objects: DeskObject[];
  history: ChatMessage[];
  beforePath?: string;
  afterPath?: string;
}): string {
  const { locale, tone = "roast", objects, history, beforePath, afterPath } = params;
  const imageInstruction =
    beforePath && afterPath
      ? `First, call your file-reading tool on BOTH images:
- BEFORE photo: "${beforePath}"
- AFTER photo: "${afterPath}"`
      : `Inspect BOTH attached images in order: Image 1 is BEFORE, Image 2 is AFTER.`;

  const roster = objects
    .map((o) => `- id: "${o.id}" | name: "${o.name}" | archetype: ${o.archetype}`)
    .join("\n");

  const recentTranscript = history
    .slice(-8)
    .map((m) => `${m.senderName}: ${m.text}`)
    .join("\n");

  return `${imageInstruction}

Compare the BEFORE desk photo against the AFTER desk photo. The owner just shot a sequel ("拍续集") after changing something on the desk (cleaned up, removed coffee/trash, added something new, or shoved things around).

${langRule(locale)}
${toneRule(tone, locale)}

### PREVIOUS CHAT MEMBERS
${roster}

### RECENT CONTEXT
${recentTranscript}

### INSTRUCTIONS
1. Identify which previous \`objects\` are visibly GONE from the After photo -> list their IDs in \`removedIds\`. Do NOT falsely mark items that are still clearly present.
2. Identify 0 to 3 genuinely NEW distinct objects visibly present in the After photo -> add them to \`newObjects\` with tight \`box_2d\` coordinates [ymin, xmin, ymax, xmax] normalized 0..1000 relative to the AFTER photo.
3. Write 4 to 6 dramatic messages matching the tone:
   - Start with \`isSystem: true, senderId: "system"\` alerts for any removed items or new items joining.
   - Then surviving/new objects react strictly to what actually changed in the photos.
   - Format \`timestamp\` strictly as \`HH:MM\`.
4. Set an updated \`resentmentScore\` (0..100) reflecting whether the desk got cleaner or worse.

Return strictly valid JSON matching the schema.`;
}

export function buildAddObjectPrompt(params: {
  locale: Locale;
  tone?: Tone;
  box_2d: Box2D;
  customName?: string;
  objects: DeskObject[];
  history: ChatMessage[];
  imageFilePath?: string;
}): string {
  const {
    locale,
    tone = "roast",
    box_2d,
    customName,
    objects,
    history,
    imageFilePath,
  } = params;

  const imageInstruction = imageFilePath
    ? `First, call your file-reading tool to inspect the desk photograph at "${imageFilePath}".`
    : `Inspect the attached desk photograph.`;

  const [ymin, xmin, ymax, xmax] = box_2d;
  const roster = objects
    .filter((o) => !o.removed)
    .map((o) => `- id: "${o.id}" | name: "${o.name}" | archetype: ${o.archetype}`)
    .join("\n");

  const recentTranscript = history
    .slice(-6)
    .map((m) => `${m.isOwner ? "[OWNER]" : m.senderName}: ${m.text}`)
    .join("\n");

  return `${imageInstruction}

The human owner just drew a bounding box directly on the desk photo to pull a specific item into the secret group chat!

### TARGET BOUNDING BOX (normalized 0..1000 [ymin, xmin, ymax, xmax])
[${ymin}, ${xmin}, ${ymax}, ${xmax}]
${customName?.trim() ? `Owner's hint / label: "${customName.trim()}"` : "No custom label provided — identify precisely what is inside that region."}

${langRule(locale)}
${toneRule(tone, locale)}

### EXISTING CHAT MEMBERS
${roster}

### RECENT CHAT CONTEXT
${recentTranscript}

### TASK
1. Identify the real visible item inside box [${ymin}, ${xmin}, ${ymax}, ${xmax}]. Give it a witty, specific \`name\`, \`roleTag\`, \`archetype\`, and \`personality\` (incorporate the owner's hint naturally if provided, while staying visually accurate).
2. Write a short \`joinNotice\` (e.g. "[${customName?.trim() || "新成员"}] 被主人圈进群聊" / "[New Item] was dragged into the chat by Owner").
3. Write 2 to 3 punchy messages:
   - First message MUST use \`senderId: "new-object"\` — the newly added object reacting to suddenly being dragged into the group chat (e.g., spilling tea on everyone else or complaining why it was ignored until now).
   - 1 to 2 follow-up messages from existing object IDs reacting to / hazing / welcoming the newcomer.
   - Format \`timestamp\` strictly as \`HH:MM\`.

Return strictly valid JSON matching the schema.`;
}

export function buildLiveTurnPrompt(params: {
  locale: Locale;
  tone?: Tone;
  trigger: "auto" | "chat";
  objects: DeskObject[];
  history: ChatMessage[];
  ownerMessage?: string;
  mentionedObjectIds?: string[];
  hasPrevFrame: boolean;
  prevPath?: string;
  currPath?: string;
}): string {
  const {
    locale,
    tone = "roast",
    trigger,
    objects,
    history,
    ownerMessage,
    mentionedObjectIds = [],
    hasPrevFrame,
    prevPath,
    currPath,
  } = params;

  let imageInstruction = "";
  if (prevPath && currPath) {
    imageInstruction = `First, call your file-reading tool on BOTH live camera snapshots:
- PREVIOUS frame: "${prevPath}"
- CURRENT LIVE frame: "${currPath}"`;
  } else if (currPath) {
    imageInstruction = `First, call your file-reading tool on the CURRENT LIVE camera frame at "${currPath}".`;
  } else if (hasPrevFrame) {
    imageInstruction = `Inspect BOTH attached live camera frames in order: Image 1 is PREVIOUS frame, Image 2 is CURRENT LIVE frame.`;
  } else {
    imageInstruction = `Inspect the attached CURRENT LIVE camera frame.`;
  }

  const activeObjects = objects.filter((o) => !o.removed);
  const roster = activeObjects
    .map((o) => `- id: "${o.id}" | name: "${o.name}" | archetype: ${o.archetype}`)
    .join("\n");

  const recentTranscript = history
    .slice(-8)
    .map((m) => `${m.isOwner ? "[OWNER]" : m.senderName}: ${m.text}`)
    .join("\n");

  const mentionedObjects = activeObjects.filter((o) =>
    mentionedObjectIds.includes(o.id)
  );

  const triggerBlock =
    trigger === "chat" && ownerMessage
      ? `### TRIGGER: LIVE CHAT + CAMERA VISION
The owner just sent: "${ownerMessage}" while their live desk camera is streaming!
${
  mentionedObjects.length > 0
    ? `Explicit @mentions: ${mentionedObjects
        .map((o) => `"${o.name}" (${o.id})`)
        .join(", ")} — EVERY @mentioned object MUST reply, AND 1 unmentioned object may chime in.`
    : "Route replies to the most relevant objects based on BOTH what the owner said AND what is visible in the current camera frame."
}`
      : `### TRIGGER: AUTO TIMED CAMERA WATCH
The desk camera just snapped a periodic check-in! Observe what changed (or didn't change — e.g., owner is still sitting there procrastinating, cup moved, hand appeared, lighting shifted) and have 2 to 3 objects whisper/gossip about the live scene.`;

  return `${imageInstruction}

You are running DeskTea's Live Camera Watch ("实况镜头模式").

${langRule(locale)}
${toneRule(tone, locale)}

### CURRENT ACTIVE MEMBERS
${roster}

### RECENT CHAT LOG
${recentTranscript}

${triggerBlock}

### INSTRUCTIONS
1. Stay strictly faithful to what is ACTUALLY visible in the CURRENT frame.
2. Only list IDs in \`removedIds\` if an existing object is clearly gone from the current frame (not merely slightly shifted).
3. Only add 0 to 2 genuinely new prominent items in \`newObjects\` if something new clearly entered the frame.
4. Generate 2 to 4 short, witty, live reactions (\`timestamp\` as \`HH:MM\`), plus an updated \`resentmentScore\` (0..100) and brief \`sceneNote\`.

Return strictly valid JSON matching the schema.`;
}
