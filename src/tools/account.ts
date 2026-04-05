import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { DESTRUCTIVE, fail, ok, READ_ONLY, requireConnection, WRITE } from "./shared.js";

export function registerAccountTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-mute-chat",
    {
      description:
        "Mute or unmute notifications for a Telegram chat. Use muteUntil=0 to unmute, or a future Unix timestamp to mute until that time. Use 2147483647 to mute forever",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        muteUntil: z.number().describe("Unix timestamp to mute until. 0 = unmute, 2147483647 = mute forever"),
      },
      annotations: WRITE,
    },
    async ({ chatId, muteUntil }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.muteChat(chatId, muteUntil);
        const status =
          muteUntil === 0
            ? "unmuted"
            : muteUntil >= 2147483647
              ? "muted forever"
              : `muted until ${new Date(muteUntil * 1000).toISOString()}`;
        return ok(`Chat ${chatId} ${status}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-chat-folders",
    {
      description: "Get list of your Telegram chat folders (filters) with their names and chat counts",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const folders = await telegram.getChatFolders();
        if (folders.length === 0) return ok("No chat folders");
        const text = folders
          .map(
            (f) =>
              `[${f.id}] ${f.emoticon ? `${f.emoticon} ` : ""}${f.title} (${f.includeCount} chats, ${f.pinnedCount} pinned)`,
          )
          .join("\n");
        return ok(text);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-auto-delete",
    {
      description:
        "Set auto-delete timer for messages in a chat. Common values: 86400 (1 day), 604800 (1 week), 2592000 (1 month). Use 0 to disable",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        period: z
          .number()
          .describe("Auto-delete period in seconds. 0 = disable. Common: 86400 (1d), 604800 (1w), 2592000 (1mo)"),
      },
      annotations: WRITE,
    },
    async ({ chatId, period }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setAutoDelete(chatId, period);
        const status = period === 0 ? "disabled" : `set to ${period}s`;
        return ok(`Auto-delete for ${chatId} ${status}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-sessions",
    {
      description:
        "Get list of all active Telegram sessions (logged-in devices) with device info, IP, and last active time",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const sessions = await telegram.getActiveSessions();
        const text = sessions
          .map(
            (s) =>
              `${s.current ? "→ " : "  "}${s.device} (${s.platform}) — ${s.appName} ${s.appVersion}\n    IP: ${s.ip} (${s.country}) | Last active: ${s.dateActive}${s.current ? " [CURRENT]" : ""}\n    Hash: ${s.hash}`,
          )
          .join("\n\n");
        return ok(text);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-terminate-session",
    {
      description: "Terminate a specific Telegram session by its hash, or terminate all other sessions",
      inputSchema: {
        hash: z
          .string()
          .optional()
          .describe("Session hash to terminate (from get-sessions). Omit to terminate ALL other sessions"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ hash }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        if (hash) {
          await telegram.terminateSession(hash);
          return ok(`Session ${hash} terminated`);
        }
        await telegram.terminateAllOtherSessions();
        return ok("All other sessions terminated");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-privacy",
    {
      description:
        "Configure privacy settings for your Telegram account. Controls who can see your phone number, last seen, profile photo, etc.",
      inputSchema: {
        setting: z
          .enum(["phone_number", "last_seen", "profile_photo", "forwards", "calls", "groups", "bio"])
          .describe("Privacy setting to change"),
        rule: z.enum(["everyone", "contacts", "nobody"]).describe("Who can see/access this"),
        allowUsers: z.array(z.string()).optional().describe("User IDs/usernames to always allow (exceptions)"),
        disallowUsers: z.array(z.string()).optional().describe("User IDs/usernames to always disallow (exceptions)"),
      },
      annotations: WRITE,
    },
    async ({ setting, rule, allowUsers, disallowUsers }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setPrivacy(setting, rule, allowUsers, disallowUsers);
        return ok(`Privacy: ${setting} set to "${rule}"`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-update-profile",
    {
      description: "Update your Telegram profile — first name, last name, bio, or username",
      inputSchema: {
        firstName: z.string().optional().describe("New first name"),
        lastName: z.string().optional().describe("New last name"),
        bio: z.string().optional().describe("New bio/about text (max 70 chars, 300 for Premium)"),
        username: z.string().optional().describe("New username (without @)"),
      },
      annotations: WRITE,
    },
    async ({ firstName, lastName, bio, username }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const updates: string[] = [];
        if (firstName !== undefined || lastName !== undefined || bio !== undefined) {
          await telegram.updateProfile({ firstName, lastName, bio });
          if (firstName !== undefined) updates.push(`firstName: ${firstName}`);
          if (lastName !== undefined) updates.push(`lastName: ${lastName}`);
          if (bio !== undefined) updates.push(`bio: ${bio}`);
        }
        if (username !== undefined) {
          await telegram.updateUsername(username);
          updates.push(`username: @${username}`);
        }
        return ok(updates.length ? `Profile updated: ${updates.join(", ")}` : "No changes specified");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-create-invite-link",
    {
      description: "Create a new invite link for a group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        expireDate: z.number().optional().describe("Link expiration as Unix timestamp"),
        usageLimit: z.number().optional().describe("Max number of users who can join via this link"),
        requestApproval: z.boolean().optional().describe("Require admin approval to join"),
        title: z.string().optional().describe("Label for the invite link (only visible to admins)"),
      },
      annotations: WRITE,
    },
    async ({ chatId, expireDate, usageLimit, requestApproval, title }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const link = await telegram.exportInviteLink(chatId, {
          expireDate,
          usageLimit,
          requestNeeded: requestApproval,
          title,
        });
        return ok(`Invite link created: ${link}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-invite-links",
    {
      description: "Get list of invite links for a group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        limit: z.number().default(20).describe("Max links to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const links = await telegram.getInviteLinks(chatId, limit);
        if (links.length === 0) return ok("No invite links");
        const text = links
          .map(
            (l) =>
              `${l.link}${l.title ? ` (${l.title})` : ""} — ${l.usageCount} uses${l.expired ? " [EXPIRED]" : ""}${l.revoked ? " [REVOKED]" : ""}`,
          )
          .join("\n");
        return ok(text);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-revoke-invite-link",
    {
      description: "Revoke an invite link for a group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        link: z.string().describe("The invite link to revoke"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ chatId, link }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.revokeInviteLink(chatId, link);
        return ok(`Invite link revoked: ${link}`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
