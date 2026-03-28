import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, sanitize, WRITE } from "./shared.js";

export function registerChatTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-list-chats",
    {
      description: "List Telegram chats with unread counts, type indicators, and contact status",
      inputSchema: {
        limit: z.number().default(20).describe("Number of chats to return"),
        offsetDate: z.number().optional().describe("Unix timestamp offset for pagination"),
        filterType: z
          .enum(["private", "group", "channel", "contact_requests"])
          .optional()
          .describe("Filter by chat type. 'contact_requests' shows only private chats from non-contacts"),
      },
      annotations: READ_ONLY,
    },
    async ({ limit, offsetDate, filterType }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const dialogs = await telegram.getDialogs(limit, offsetDate, filterType);
        const text = dialogs
          .map((d) => {
            const prefix = d.type === "group" ? "G" : d.type === "channel" ? "C" : "P";
            const botTag = d.isBot ? " [bot]" : "";
            const contactTag = d.type === "private" && d.isContact === false ? " [not in contacts]" : "";
            const unread = d.unreadCount > 0 ? ` [${d.unreadCount} unread]` : "";
            return `${prefix} ${d.name} (${d.id})${botTag}${contactTag}${unread}`;
          })
          .join("\n");
        return ok(sanitize(text) || "No chats");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-search-chats",
    {
      description:
        "Search for Telegram chats, users, or channels by name or username. Returns description and member count",
      inputSchema: {
        query: z.string().describe("Search query (name or username)"),
        limit: z.number().default(10).describe("Max results"),
      },
      annotations: READ_ONLY,
    },
    async ({ query, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const results = await telegram.searchChats(query, limit);
        const text = results
          .map(
            (c) =>
              `${c.type === "group" ? "G" : c.type === "channel" ? "C" : "P"} ${c.name}${c.username ? ` (@${c.username})` : ""} (${c.id})${c.membersCount ? ` [${c.membersCount} members]` : ""}${c.description ? ` — ${c.description.split("\n")[0].slice(0, 100)}` : ""}`,
          )
          .join("\n");
        return ok(sanitize(text) || "No results");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-chat-info",
    {
      description:
        "Get detailed info about a Telegram chat including name, type, members, description, and forum status",
      inputSchema: { chatId: z.string().describe("Chat ID or username") },
      annotations: READ_ONLY,
    },
    async ({ chatId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const info = await telegram.getChatInfo(chatId);
        const lines = [
          `Name: ${info.name}`,
          `ID: ${info.id}`,
          `Type: ${info.type}`,
          ...(info.forum ? ["Forum: yes"] : []),
          ...(info.username ? [`Username: @${info.username}`] : []),
          ...(info.description ? [`Description: ${info.description}`] : []),
          ...(info.membersCount != null ? [`Members: ${info.membersCount}`] : []),
        ];
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-chat-members",
    {
      description: "Get members of a Telegram group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        limit: z.number().default(50).describe("Number of members to return"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId, limit }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const members = await telegram.getChatMembers(chatId, limit);
        const text = members
          .map((m) => {
            const role = m.role !== "member" ? ` [${m.role}]` : "";
            return `${m.name}${m.username ? ` (@${m.username})` : ""} (${m.id})${role}`;
          })
          .join("\n");
        return ok(sanitize(text) || "No members found");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-my-role",
    {
      description: "Get the current user's role in a chat (creator, admin, or member)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
      },
      annotations: READ_ONLY,
    },
    async ({ chatId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.getMyRole(chatId);
        return ok(`Role: ${result.role}\nChat: ${result.chatName} (${result.chatId})`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-create-group",
    {
      description: "Create a new Telegram group or supergroup",
      inputSchema: {
        title: z.string().describe("Group name"),
        users: z.array(z.string()).describe("Usernames or IDs to invite"),
        supergroup: z.boolean().default(false).describe("Create as supergroup (supports >200 members, admin features)"),
        forum: z.boolean().default(false).describe("Enable topics (requires supergroup)"),
        description: z.string().optional().describe("Group description"),
      },
      annotations: WRITE,
    },
    async ({ title, users, supergroup, forum, description }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.createGroup({ title, users, supergroup, forum, description });
        const lines = [
          `Created ${result.type}: ${result.title}`,
          `ID: ${result.id}`,
          ...(result.inviteLink ? [`Invite link: ${result.inviteLink}`] : []),
        ];
        return ok(lines.join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-join-chat",
    {
      description: "Join a Telegram group or channel by username or invite link",
      inputSchema: {
        target: z.string().describe("Username (@group), link (t.me/group), or invite link (t.me/+xxx)"),
      },
      annotations: WRITE,
    },
    async ({ target }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.joinChat(target);
        return ok(`Joined ${result.type}: ${result.title} (ID: ${result.id})`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-leave-group",
    {
      description: "Leave a Telegram group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
      },
      annotations: WRITE,
    },
    async ({ chatId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.leaveGroup(chatId);
        return ok(`Left chat ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-invite-to-group",
    {
      description: "Invite users to a Telegram group or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        users: z.array(z.string()).describe("Usernames or IDs to invite"),
      },
      annotations: WRITE,
    },
    async ({ chatId, users }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        const result = await telegram.inviteToGroup(chatId, users);
        const lines = [];
        if (result.invited.length > 0) lines.push(`Invited: ${result.invited.join(", ")}`);
        if (result.failed.length > 0) lines.push(`Failed: ${result.failed.join(", ")}`);
        return ok(lines.join("\n") || "No users processed");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-kick-user",
    {
      description: "Kick a user from a Telegram group (removes without permanent ban)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to kick"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.kickUser(chatId, userId);
        return ok(`Kicked ${userId} from ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-ban-user",
    {
      description: "Ban a user from a supergroup or channel (permanent until unbanned)",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to ban"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.banUser(chatId, userId);
        return ok(`Banned ${userId} from ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-unban-user",
    {
      description: "Unban a previously banned user from a supergroup or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to unban"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.unbanUser(chatId, userId);
        return ok(`Unbanned ${userId} in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-edit-group",
    {
      description: "Edit a group's title, description, or photo",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        title: z.string().optional().describe("New group title"),
        description: z.string().optional().describe("New group description (supergroups only)"),
        photoPath: z.string().optional().describe("Absolute path to new group photo image file"),
      },
      annotations: WRITE,
    },
    async ({ chatId, title, description, photoPath }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.editGroup(chatId, { title, description, photoPath });
        const changed = [title && "title", description != null && "description", photoPath && "photo"].filter(Boolean);
        return ok(`Updated ${changed.join(", ")} for ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-admin",
    {
      description: "Promote a user to admin in a supergroup or channel with full permissions",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to promote"),
        title: z.string().optional().describe("Custom admin title"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId, title }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.setAdmin(chatId, userId, { title });
        return ok(`Promoted ${userId} to admin in ${chatId}${title ? ` (${title})` : ""}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-remove-admin",
    {
      description: "Remove admin rights from a user in a supergroup or channel",
      inputSchema: {
        chatId: z.string().describe("Chat ID or username"),
        userId: z.string().describe("User ID or username to demote"),
      },
      annotations: WRITE,
    },
    async ({ chatId, userId }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));

      try {
        await telegram.removeAdmin(chatId, userId);
        return ok(`Removed admin rights from ${userId} in ${chatId}`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
