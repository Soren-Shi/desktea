import { getObjectStatus } from "./normalize";
import type { Box2D, ChatMessage, DeskObject, Locale, Tone } from "./types";

function formatMemberLine(o: DeskObject, includeBox = false): string {
  const moodPart = o.mood ? ` | mood: ${o.mood}` : "";
  const boxPart = includeBox ? ` | box_2d: [${o.box_2d.join(", ")}]` : "";
  const memPart =
    o.memories && o.memories.length > 0
      ? ` | memories: [${o.memories.slice(-3).join("; ")}]`
      : "";
  return `- id: "${o.id}" | name: "${o.name}" | role: "${o.roleTag}" | archetype: ${o.archetype}${moodPart}${boxPart} | personality: ${o.personality}${memPart}`;
}

function buildRosterSections(objects: DeskObject[], includeBox = false): {
  active: DeskObject[];
  muted: DeskObject[];
  kicked: DeskObject[];
  gone: DeskObject[];
  text: string;
} {
  const active: DeskObject[] = [];
  const muted: DeskObject[] = [];
  const kicked: DeskObject[] = [];
  const gone: DeskObject[] = [];
  for (const o of objects) {
    const st = getObjectStatus(o);
    if (st === "active") active.push(o);
    else if (st === "muted") muted.push(o);
    else if (st === "kicked") kicked.push(o);
    else gone.push(o);
  }
  const blocks: string[] = [];
  blocks.push(
    `### ACTIVE SPEAKING MEMBERS\n${
      active.length > 0
        ? active.map((o) => formatMemberLine(o, includeBox)).join("\n")
        : "(none)"
    }`
  );
  if (muted.length > 0) {
    blocks.push(
      `### MUTED MEMBERS (CANNOT SEND MESSAGES UNTIL UNMUTED)\n${muted
        .map((o) => formatMemberLine(o, includeBox))
        .join("\n")}`
    );
  }
  if (kicked.length > 0) {
    blocks.push(
      `### KICKED / EXILED MEMBERS (OUTSIDE GROUP — CAN BE PULLED BACK VIA "invite" ACTION)\n${kicked
        .map((o) => formatMemberLine(o, includeBox))
        .join("\n")}`
    );
  }
  if (gone.length > 0) {
    blocks.push(
      `### PHYSICALLY GONE FROM DESK (REMOVED IN SEQUEL)\n${gone
        .map((o) => `- id: "${o.id}" | name: "${o.name}"`)
        .join("\n")}`
    );
  }
  return { active, muted, kicked, gone, text: blocks.join("\n\n") };
}

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
  groupName?: string;
  objects: DeskObject[];
  history: ChatMessage[];
  ownerMessage: string;
  isFirstBreach: boolean;
  mentionedObjectIds?: string[];
  localTimeContext?: string;
  hasImage?: boolean;
  imageFilePath?: string;
}): string {
  const {
    locale,
    tone = "roast",
    groupName,
    objects,
    history,
    ownerMessage,
    isFirstBreach,
    mentionedObjectIds = [],
    localTimeContext,
    hasImage = false,
    imageFilePath,
  } = params;

  const roster = buildRosterSections(objects, hasImage);
  const activeObjects = roster.active;

  const mentionedObjects = objects.filter((o) =>
    mentionedObjectIds.includes(o.id)
  );
  const unmentionedObjects = activeObjects.filter(
    (o) => !mentionedObjectIds.includes(o.id)
  );

  // Strip the trailing owner message from history so it isn't duplicated twice in the prompt
  const priorHistory =
    history.length > 0 &&
    history[history.length - 1].isOwner &&
    history[history.length - 1].text.trim() === ownerMessage.trim()
      ? history.slice(0, -1)
      : history;

  const recentTranscript = priorHistory
    .slice(-10)
    .map(
      (m) =>
        `${m.isOwner ? "[OWNER]" : m.isSystem ? "[SYSTEM]" : m.senderName}: ${m.text}`
    )
    .join("\n");

  const visualBlock = hasImage
    ? `\n### ATTACHED DESK PHOTOGRAPH & VISUAL DISCOVERY (\`newObjects[]\`)
${
  imageFilePath
    ? `First, call your file-reading tool to inspect the desk photograph at "${imageFilePath}".`
    : "The current desk photograph IS ATTACHED! Inspect it carefully."
}
- Every existing member's \`box_2d\` is listed in the roster above so you know which items are ALREADY in the group chat.
- **IF the owner asks to pull/invite/add unboxed items visible on the desk into the group chat** (e.g. "桌面上还有两个植物，拉进群聊" / "拉近群聊" / "把鼠标也拉进来" / "pull the other two plants in"):
  1. Look at the photo and locate those EXACT unboxed physical items (make sure their \`box_2d\` does NOT overlap any already-boxed member!).
  2. Return them in \`newObjects[]\` (0 to 3 items) with tight normalized \`box_2d\` \`[ymin, xmin, ymax, xmax]\` (0..1000) and distinct witty names (e.g. distinguish multiple plants by position like "左侧小多肉" / "右侧小多肉").
  3. Have the newly added items immediately speak in \`messages[]\` using their exact \`newObjects[].id\` (reacting to finally being invited after sitting on the desk ignored!), plus 1 reaction from an existing member!
- **IF the owner is NOT asking to add new items** (just asking about something visible in the photo), keep \`newObjects: []\` and answer truthfully based on what is actually visible.\n`
    : `\n### NEW OBJECTS\nNo desk photograph is attached this turn — you MUST return \`newObjects: []\`.\n`;

  const routingDirective =
    mentionedObjects.length > 0
      ? `### TRIGGER ROUTING (EXPLICIT @MENTIONS DETECTED)
- PRIMARY TARGETS (@mentioned by the owner): ${mentionedObjects
          .map((o) => `"${o.name}" (id: "${o.id}", status: ${getObjectStatus(o)})`)
          .join(", ")}.
- If a mentioned target is active and NOT being kicked/muted right now, have it react first (defending itself, panicking, or throwing another object under the bus!).
- If a mentioned target is kicked/exiled and the owner invites it back, emit an \`invite\` action and let it burst back in with attitude!
- Then choose organically: either stop right after the target replies, OR have 1–2 bystanders (${unmentionedObjects
          .map((o) => `"${o.name}" (id: "${o.id}")`)
          .join(", ") || "none"}) reply TO THE TARGET (side-gossip, snitching, or arguing with each other — not everyone needs to address the owner).`
      : `### ORGANIC GROUP-CHAT CHOREOGRAPHY (CRITICAL — AVOID ROBOTIC TURN-TAKING)
NEVER have 3 objects politely line up to reply to the owner one by one. Real group chats don't work like a panel interview!
Dynamically choose ONE natural rhythm from below based on what the owner just said:
1. **Single Beat (1 message)**: One most relevant item drops a razor-sharp short comeback directly, and the room falls awkwardly quiet.
2. **Side-Whisper / Ignore Owner (2–3 messages)**: One item barely acknowledges the owner (or side-steps completely), pings \`@AnotherObject\` to gossip ABOUT the owner's latest message, and \`@AnotherObject\` replies directly to the first item (\`replyToName\` = first item's exact name).
3. **Object-vs-Object Squabble (2–3 messages)**: The owner's newest message sparks two objects to argue, vote, blame-shift, or snitch on each other (\`replyToName\` pointing between items).`;

  const timeBlock = localTimeContext
    ? `\n### CURRENT REAL TIME\n${localTimeContext}\n`
    : "";

  return `You are directing a living secret group chat of desk objects right after the human owner ${
    isFirstBreach
      ? "just BROKE INTO the group chat and caught everyone talking trash"
      : "spoke inside the intercepted chat"
  }.
${groupName ? `Current group name: "${groupName}"` : ""}

${langRule(locale)}
${toneRule(tone, locale)}
${timeBlock}
${roster.text}
${visualBlock}
${routingDirective}

### LIVING AGENT AGENCY & REAL GROUP ACTIONS (\`actions[]\` + \`objectUpdates[]\`)
You are NOT just generating static text — this group chat has REAL mutable state!
1. **Owner Power Moves** (honor natural language commands in ANY phrasing):
   - **Kick out** (e.g. "把XX踢出去", "滚出群", "kick XX"): emit \`{ type: "kick", objectId, value: reason, systemNotice }\`. The kicked member CANNOT speak after being kicked! Remaining members react in shock, relief, or panic ("next it's gonna be me").
   - **Pull back / Invite KICKED member** (e.g. "把XX拉回来", "让XX回来", "bring XX back"): emit \`{ type: "invite", objectId, value: reason, systemNotice }\` targeting a KICKED (or gone) member. That returning member CAN speak immediately in \`messages\` — holding a grudge or acting smug about being begged back!
   - **Mute / Unmute** (e.g. "把XX禁言", "XX闭嘴", "mute XX" / "解除禁言", "unmute XX"): emit \`mute\` or \`unmute\`. Muted members CANNOT speak until unmuted!
   - **Rename group** (e.g. "改群名叫...", "rename group to..."): emit \`{ type: "rename_group", objectId: "", value: newName, systemNotice }\`.
   - **Assign title / admin** (e.g. "封XX当群主/管理员/内鬼", "make XX admin"): emit \`{ type: "set_title", objectId, value: newRoleTag, systemNotice }\`.
   - If the owner did NOT command any state change, keep \`actions: []\` unless a rare dramatic autonomous event below is truly earned.
2. **Autonomous Living Behavior**:
   - **Rage-Quit (\`leave\`)**: Only if the owner harshly insults or threatens to trash a specific object, that object may dramatically rage-quit (\`{ type: "leave", objectId, ... }\`) so the owner has to coax/invite it back!
   - **Emotional Memory (\`objectUpdates\`)**: Whenever an object gets threatened, defended, snitched on, kicked, invited back, or given a broken promise, record a brief \`mood\` shift and 1 short \`memoryNote\`. Reference existing \`memories\` naturally!

### PRIOR CHAT LOG (CONTEXT ONLY — DO NOT REPEAT OR RE-ANSWER OLD TURNS!)
${recentTranscript || "(No prior messages yet)"}

### NEWEST MESSAGE FROM OWNER (RESPOND DIRECTLY TO THIS!)
"${ownerMessage}"

### STRICT ANTI-REPETITION & IDENTITY LOCK (CRITICAL)
- **TOPIC FOCUS**: Respond specifically to the NEWEST MESSAGE FROM OWNER above ("${ownerMessage}"). NEVER re-answer an older owner message from the prior chat log!
- **ZERO PARROTING**: NEVER copy, reuse, or paraphrase any sentence, joke, or phrase already present in PRIOR CHAT LOG! Every single line MUST be 100% fresh!
- **IDENTITY LOCK**: Double-check every \`senderId\` against the roster — a succulent/plant NEVER says "I'm not a plant"; a mug speaks as a mug; a keyboard speaks as a keyboard. Never swap speakers' identities!

### DIRECTIVE
Generate 1 to 4 organic, fresh, rapid-fire messages (\`senderId\` MUST match an ACTIVE speaking object ID, a newly restored \`invite\`/\`unmute\` object ID, or a newly added \`newObjects[].id\`):
- NEVER let a muted, kicked, or newly kicked object send messages in \`messages\`.
- Prioritize object-to-object cross-talk (\`replyToName\` = exact name of another object) whenever an item stirs up drama or whispers sideways.
- Keep each message under 2 short sentences — authentic texting cadence, zero AI fluff.
- Format \`timestamp\` as the CURRENT \`HH:MM\` (never jump into future minutes).
- Update \`tensionDelta\` (-20 to +20) depending on whether the owner earned respect, made weak excuses, or abused admin power.

Return strictly valid JSON matching the schema.`;
}

export function buildChatterPrompt(params: {
  locale: Locale;
  tone?: Tone;
  groupName?: string;
  objects: DeskObject[];
  history: ChatMessage[];
  ownerPresent: boolean;
  localTimeContext?: string;
}): string {
  const {
    locale,
    tone = "roast",
    groupName,
    objects,
    history,
    ownerPresent,
    localTimeContext,
  } = params;

  const roster = buildRosterSections(objects);

  const recentTranscript = history
    .slice(-12)
    .map((m) => `${m.isOwner ? "[OWNER]" : m.isSystem ? "[SYSTEM]" : m.senderName}: ${m.text}`)
    .join("\n");

  const presenceDirective = ownerPresent
    ? `### PRESENCE: OWNER IS SILENTLY WATCHING / LURKING
- The human owner is in the chat silently reading without typing. Objects should awkwardly whisper sideways to each other ("uh, are they still staring at this chat?", side-eyeing each other, shifting blame) OR talk around the owner. Keep \`actions: []\`.`
    : `### PRESENCE: OWNER IS NOT LOOKING / STEPPED AWAY
- The owner isn't paying attention right now (or just stepped away from the desk). Objects feel safe talking freely behind the owner's back, spilling fresh petty grievances, recalling past \`memories\`, or double-checking whether the owner really walked away.
- **OCCASIONAL SECRET MISCHIEF (optional, ~25% of turns when owner is away)**:
  - If there is a KICKED member outside the group, an active ally can secretly pull them back in (\`invite\`) behind the owner's back!
  - OR an object can secretly rename the group (\`rename_group\`) to something petty about the owner!`;

  return `You are continuing a living secret group chat between desk objects having a spontaneous conversation WITH EACH OTHER (the owner did NOT send a message this turn).
${groupName ? `Current group name: "${groupName}"` : ""}

${langRule(locale)}
${toneRule(tone, locale)}

${localTimeContext ? `### CURRENT REAL TIME\n${localTimeContext}\n` : ""}
${roster.text}

${presenceDirective}

### RECENT CHAT LOG (DO NOT REPEAT OR RECYCLE THESE JOKES)
${recentTranscript || "(No prior messages yet)"}

### DIRECTIVE
Generate 1 to 3 organic back-and-forth messages STRICTLY between the ACTIVE speaking objects above (plus any kicked member secretly invited back this turn):
- Pick an unresolved thread from the recent chat, an object's existing \`memories\`, a kicked/muted comrade's fate, or the current time of day (${localTimeContext || "right now"}).
- Make items address EACH OTHER (\`@ExactObjectName\` and \`replyToName\` = another object's exact name) rather than lecturing the owner.
- STRICT ANTI-REPETITION: Do NOT repeat phrases, punchlines, or opening hooks already used in RECENT CHAT LOG. Keep each line crisp (1–2 short texting lines).
- Update \`objectUpdates\` if an alliance forms or mood shifts.
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
- BEFORE photo (Image 1): "${beforePath}"
- AFTER photo (Image 2): "${afterPath}"`
      : `Inspect BOTH attached images carefully in order: Image 1 is BEFORE, Image 2 is AFTER.`;

  const prevActive = objects.filter((o) => !o.removed && getObjectStatus(o) !== "gone");
  const roster = prevActive
    .map(
      (o) =>
        `- id: "${o.id}" | name: "${o.name}" | roleTag: "${o.roleTag}" | archetype: ${o.archetype} | before_box_2d: [${o.box_2d.join(", ")}]`
    )
    .join("\n");

  const recentTranscript = history
    .slice(-8)
    .map((m) => `${m.senderName}: ${m.text}`)
    .join("\n");

  return `${imageInstruction}

Compare Image 1 (BEFORE) against Image 2 (AFTER). The owner shot a follow-up sequel ("拍续集") after changing something on the desk (removing/throwing away an item, adding a new item, or moving things around).

${langRule(locale)}
${toneRule(tone, locale)}

### PREVIOUS ACTIVE DESK MEMBERS (WITH THEIR EXACT BEFORE COORDINATES [ymin, xmin, ymax, xmax] 0..1000)
${roster}

### RECENT CONTEXT
${recentTranscript}

### STEP 1: STRICT PER-OBJECT VISUAL AUDIT (\`objectAudits[]\`) — ZERO HALLUCINATION!
NOTE ON CAMERA DRIFT: Both photos were shot handheld from roughly the same spot, so expect small natural framing shifts (3–15% translation, slight zoom/tilt). Match items by **true physical identity** (shape, color, texture, markings), NOT blind coordinate overlap!

Audit EVERY SINGLE previous object listed above in \`objectAudits\` (exact same \`id\`):
1. Look at its \`before_box_2d\` in Image 1 so you know EXACTLY which physical item it is.
2. Search Image 2 (AFTER) carefully for that EXACT same physical item:
   - **If that EXACT physical item is GONE / MISSING from Image 2** (even if another object or empty table now occupies those coordinates):
     - Set \`status: "removed"\`, \`afterBox2d: [0, 0, 0, 0]\`, and explain briefly in \`evidence\` (e.g. "empty desk surface where the coffee cup used to be").
     - ALSO include its \`id\` in \`removedIds\`.
     - **CRITICAL ANTI-BUG RULE**: NEVER force-assign a missing object's ID to a different nearby item, a background region, or a newly placed item! If you cannot clearly see the same physical object in Image 2, it MUST be \`status: "removed"\`!
   - **If that EXACT physical item is STILL visibly present in Image 2**:
     - Set \`status: "kept"\` (roughly same spot relative to desk) or \`status: "moved"\` (clearly repositioned on the desk).
     - Return its **TIGHT, ACCURATE NEW \`afterBox2d\`** \`[ymin, xmin, ymax, xmax]\` in Image 2's coordinate space (compensating for any camera shift or item movement!).

### STEP 2: GENUINELY NEW OBJECTS (\`newObjects[]\`)
- Identify 0 to 3 genuinely NEW distinct physical items clearly visible in Image 2 that were NOT in Image 1.
- NEVER duplicate any item already marked \`kept\` or \`moved\` in \`objectAudits\`!
- Provide tight \`box_2d\` coordinates [ymin, xmin, ymax, xmax] normalized 0..1000 relative to Image 2.

### STEP 3: SEQUEL GROUP CHAT (4 to 6 messages)
- Start with \`isSystem: true, senderId: "system"\` alerts ONLY for items truly removed or truly newly added.
- Surviving and new objects react strictly to what ACTUALLY changed in the photos (grieving/roasting who disappeared, hazing newcomers, commenting on who got shoved aside).
- Format \`timestamp\` strictly as \`HH:MM\`.
- Set an updated \`resentmentScore\` (0..100) reflecting whether the desk got cleaner or worse.

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
