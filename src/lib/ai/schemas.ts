export const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    groupName: {
      type: "string",
      description: "Witty, slightly passive-aggressive group chat title reflecting the desk's vibe.",
    },
    resentmentScore: {
      type: "integer",
      description: "0 to 100 resentment index of the objects toward their owner.",
    },
    verdict: {
      type: "string",
      description: "One sharp editorial diagnostic sentence summarizing the desk's psychological state.",
    },
    mostLikelyToLeave: {
      type: "string",
      description: "Exact name of the object most desperate to quit or run away.",
    },
    objects: {
      type: "array",
      description: "4 to 6 clearly visible, distinct, non-overlapping desk objects.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Short slug id like obj-1, obj-2." },
          name: { type: "string", description: "Specific evocative name referencing visible visual state." },
          roleTag: { type: "string", description: "Short 2-5 word role title in the group chat." },
          archetype: {
            type: "string",
            enum: ["laborer", "dust", "consumable", "observer"],
            description: "Faction archetype in the desk hierarchy.",
          },
          personality: { type: "string", description: "One-line attitude/grudge summary." },
          box_2d: {
            type: "array",
            description: "Tight 2D bounding box [ymin, xmin, ymax, xmax] normalized 0 to 1000.",
            items: { type: "integer" },
          },
        },
        required: ["id", "name", "roleTag", "archetype", "personality", "box_2d"],
      },
    },
    messages: {
      type: "array",
      description: "8 to 10 punchy group chat messages from these objects.",
      items: {
        type: "object",
        properties: {
          senderId: { type: "string", description: "Must match one of the objects[].id values." },
          text: { type: "string", description: "Concise natural chat line with @mentions and concrete photo details." },
          replyToName: { type: "string", description: "Optional object name being replied to, or empty string." },
          reaction: { type: "string", description: "Single emoji reaction like 💀, 😂, 👀, 🫠, or empty string." },
          timestamp: { type: "string", description: "Chat timestamp like 02:14." },
        },
        required: ["senderId", "text", "replyToName", "reaction", "timestamp"],
      },
    },
  },
  required: ["groupName", "resentmentScore", "verdict", "mostLikelyToLeave", "objects", "messages"],
} as const;

const GROUP_ACTIONS_SCHEMA = {
  type: "array",
  description:
    "0 to 2 real group-chat state changes triggered by the owner's command (kick/invite/mute/unmute/rename_group/set_title) OR rare dramatic object agency (leave/rename_group). Empty array if no state change.",
  items: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: [
          "kick",
          "invite",
          "mute",
          "unmute",
          "rename_group",
          "set_title",
          "leave",
        ],
      },
      objectId: {
        type: "string",
        description:
          "Exact object id for member actions, or empty string for rename_group.",
      },
      value: {
        type: "string",
        description:
          "New group name (rename_group), new roleTag (set_title), or short reason/empty string.",
      },
      systemNotice: {
        type: "string",
        description:
          "Concise in-language group system alert, e.g. '[冰美式] 被主人移出了群聊' or 'Owner invited [Coffee Mug] back to the chat'.",
      },
    },
    required: ["type", "objectId", "value", "systemNotice"],
  },
} as const;

const OBJECT_UPDATES_SCHEMA = {
  type: "array",
  description:
    "0 to 3 emotional/memory updates for objects whose mood shifted or who formed a lasting grudge/memory this turn.",
  items: {
    type: "object",
    properties: {
      objectId: { type: "string" },
      mood: {
        type: "string",
        enum: ["chill", "annoyed", "panicked", "smug", "betrayed", "dramatic"],
      },
      memoryNote: {
        type: "string",
        description:
          "Short 3-10 word grudge/event to remember in future turns, or empty string.",
      },
    },
    required: ["objectId", "mood", "memoryNote"],
  },
} as const;

export const REPLY_SCHEMA = {
  type: "object",
  properties: {
    tensionDelta: {
      type: "integer",
      description: "Change in resentment score from -20 to +20 based on how convincing or shameless the owner's reply is.",
    },
    actions: GROUP_ACTIONS_SCHEMA,
    objectUpdates: OBJECT_UPDATES_SCHEMA,
    newObjects: {
      type: "array",
      description:
        "ONLY when the desk photo is attached AND the owner explicitly asks to pull/invite/add unboxed visible items from the photo into the group chat: 0 to 3 newly spotted distinct items with tight box_2d [ymin, xmin, ymax, xmax] (0..1000). Otherwise MUST be empty array [].",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Short slug id like obj-add-1." },
          name: { type: "string", description: "Specific evocative name of the newly spotted item." },
          roleTag: { type: "string", description: "Short 2-5 word role title." },
          archetype: {
            type: "string",
            enum: ["laborer", "dust", "consumable", "observer"],
          },
          personality: { type: "string", description: "One-line attitude/grudge." },
          box_2d: {
            type: "array",
            description: "Tight 2D bounding box [ymin, xmin, ymax, xmax] normalized 0..1000.",
            items: { type: "integer" },
          },
        },
        required: ["id", "name", "roleTag", "archetype", "personality", "box_2d"],
      },
    },
    messages: {
      type: "array",
      description:
        "1 to 4 organic, NON-REPETITIVE group-chat messages directly addressing the newest owner message (including newly added items from newObjects if any).",
      items: {
        type: "object",
        properties: {
          senderId: { type: "string", description: "Must match an active speaking object id or a newly added newObjects[].id." },
          text: { type: "string", description: "Fresh, sharp, funny reaction staying strictly in character (NEVER copy previous turns)." },
          replyToName: { type: "string", description: "Target name or empty string." },
          reaction: { type: "string", description: "Single emoji reaction or empty string." },
          timestamp: { type: "string", description: "Current HH:MM time matching CURRENT REAL TIME (never in the future)." },
        },
        required: ["senderId", "text", "replyToName", "reaction", "timestamp"],
      },
    },
  },
  required: ["tensionDelta", "actions", "objectUpdates", "newObjects", "messages"],
} as const;

export const DIFF_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "One-line forensic summary of what changed between Before and After photos.",
    },
    resentmentScore: {
      type: "integer",
      description: "Updated resentment index from 0 to 100.",
    },
    objectAudits: {
      type: "array",
      description:
        "EXACTLY one visual audit per previous active object checking whether that exact physical item still exists in Image 2 (AFTER) and where it is located.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Exact previous object id." },
          status: {
            type: "string",
            enum: ["kept", "moved", "removed"],
            description:
              "kept = still present in roughly the same relative spot; moved = same exact item relocated on desk; removed = physically gone/missing from Image 2.",
          },
          evidence: {
            type: "string",
            description:
              "Concise visual proof in Image 2 confirming presence or absence (never guess).",
          },
          afterBox2d: {
            type: "array",
            description:
              "Tight [ymin, xmin, ymax, xmax] (0..1000) of this exact item in Image 2. MUST be [0, 0, 0, 0] if status is 'removed'.",
            items: { type: "integer" },
          },
        },
        required: ["id", "status", "evidence", "afterBox2d"],
      },
    },
    removedIds: {
      type: "array",
      description: "IDs from the previous objects list that disappeared or were removed in the After photo (must match objectAudits with status='removed').",
      items: { type: "string" },
    },
    newObjects: {
      type: "array",
      description: "0 to 3 genuinely NEW distinct objects visibly present in the After photo that were NOT in the Before photo, with box_2d normalized 0..1000.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Slug id like obj-new-1." },
          name: { type: "string" },
          roleTag: { type: "string" },
          archetype: {
            type: "string",
            enum: ["laborer", "dust", "consumable", "observer"],
          },
          personality: { type: "string" },
          box_2d: {
            type: "array",
            items: { type: "integer" },
          },
        },
        required: ["id", "name", "roleTag", "archetype", "personality", "box_2d"],
      },
    },
    messages: {
      type: "array",
      description: "4 to 6 dramatic messages reacting strictly to who got removed, added, or moved.",
      items: {
        type: "object",
        properties: {
          senderId: { type: "string", description: "Existing surviving object id, new object id, or 'system'." },
          isSystem: { type: "boolean", description: "True for system leave/join events like '[Iced Coffee] left the chat'." },
          text: { type: "string" },
          replyToName: { type: "string" },
          reaction: { type: "string" },
          timestamp: { type: "string" },
        },
        required: ["senderId", "isSystem", "text", "replyToName", "reaction", "timestamp"],
      },
    },
  },
  required: ["summary", "resentmentScore", "objectAudits", "removedIds", "newObjects", "messages"],
} as const;

export const ADD_OBJECT_SCHEMA = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Evocative short name of the object inside the drawn box.",
    },
    roleTag: {
      type: "string",
      description: "Short 2-5 word group role title.",
    },
    archetype: {
      type: "string",
      enum: ["laborer", "dust", "consumable", "observer"],
    },
    personality: {
      type: "string",
      description: "One-line grudge or vibe of this newly spotted item.",
    },
    joinNotice: {
      type: "string",
      description: "Short system join line like '[半开 MacBook] 被主人拉进了群'.",
    },
    messages: {
      type: "array",
      description: "2 to 3 punchy messages: the newcomer's debut line plus 1-2 reactions from existing cast.",
      items: {
        type: "object",
        properties: {
          senderId: {
            type: "string",
            description: "Use 'new-object' for the newly added item, or an existing object id.",
          },
          text: { type: "string" },
          replyToName: { type: "string" },
          reaction: { type: "string" },
          timestamp: { type: "string" },
        },
        required: ["senderId", "text", "replyToName", "reaction", "timestamp"],
      },
    },
  },
  required: ["name", "roleTag", "archetype", "personality", "joinNotice", "messages"],
} as const;

export const LIVE_TURN_SCHEMA = {
  type: "object",
  properties: {
    sceneNote: {
      type: "string",
      description: "Concise observation of what changed or what the owner is doing on camera right now, or empty string.",
    },
    resentmentScore: {
      type: "integer",
      description: "Updated resentment index 0 to 100.",
    },
    removedIds: {
      type: "array",
      description: "IDs of existing objects clearly gone from the current camera frame.",
      items: { type: "string" },
    },
    newObjects: {
      type: "array",
      description: "0 to 2 genuinely new objects appearing in the current frame with box_2d normalized 0..1000.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          roleTag: { type: "string" },
          archetype: {
            type: "string",
            enum: ["laborer", "dust", "consumable", "observer"],
          },
          personality: { type: "string" },
          box_2d: {
            type: "array",
            items: { type: "integer" },
          },
        },
        required: ["id", "name", "roleTag", "archetype", "personality", "box_2d"],
      },
    },
    messages: {
      type: "array",
      description: "2 to 4 sharp live messages reacting to the live frame (and ownerMessage if present).",
      items: {
        type: "object",
        properties: {
          senderId: { type: "string" },
          isSystem: { type: "boolean" },
          text: { type: "string" },
          replyToName: { type: "string" },
          reaction: { type: "string" },
          timestamp: { type: "string" },
        },
        required: ["senderId", "isSystem", "text", "replyToName", "reaction", "timestamp"],
      },
    },
  },
  required: ["sceneNote", "resentmentScore", "removedIds", "newObjects", "messages"],
} as const;

export const CHATTER_SCHEMA = {
  type: "object",
  properties: {
    tensionDelta: {
      type: "integer",
      description: "Subtle resentment shift from -8 to +8.",
    },
    actions: GROUP_ACTIONS_SCHEMA,
    objectUpdates: OBJECT_UPDATES_SCHEMA,
    messages: {
      type: "array",
      description: "1 to 3 organic autonomous messages strictly between desk objects.",
      items: {
        type: "object",
        properties: {
          senderId: {
            type: "string",
            description: "Must match one of the active speaking objects[].id values.",
          },
          text: {
            type: "string",
            description:
              "Short natural side-conversation line referencing real desk details or recent chat.",
          },
          replyToName: {
            type: "string",
            description: "Exact name of another object being replied to, or empty string.",
          },
          reaction: {
            type: "string",
            description: "Single emoji reaction or empty string.",
          },
          timestamp: {
            type: "string",
            description: "Current HH:MM timestamp.",
          },
        },
        required: ["senderId", "text", "replyToName", "reaction", "timestamp"],
      },
    },
  },
  required: ["tensionDelta", "actions", "objectUpdates", "messages"],
} as const;
