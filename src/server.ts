import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new McpServer({
  name: "test",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
    prompts: {},
  },
});

server.registerResource(
  "users",
  "users://all",
  {
    title: "users",
    description: "get all users from the DB",
    mimeType: "application/json",
  },
  async (uri) => {
    const users = await import("./data/users.json", {
      with: { type: "json" },
    }).then((m) => m.default);

    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(users),
          mimeType: "application/json",
        },
      ],
    };
  }
);

// Dynamic Resource with parameter
server.registerResource(
  "user-details",
  new ResourceTemplate("users://{userId}/profile", {
    list: undefined,
  }),
  {
    title: "User Details",
    description: "get a user's details from the DB",
    mimeType: "application/json",
  },
  async (uri, { userId }) => {
    const users = await import("./data/users.json", {
      with: { type: "json" },
    }).then((m) => m.default);

    const user = users.find((u) => u.id === parseInt(userId as string));

    if (user == null) {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ error: "User not found" }),
            mimeType: "application/json",
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(user),
          mimeType: "application/json",
        },
      ],
    };
  }
);

server.registerTool(
  "create-user",
  {
    title: "Create User",
    description: "create a new user in the DB",
    inputSchema: {
      name: z.string(),
      email: z.string(),
      address: z.string(),
      phone: z.string(),
    },
    annotations: {
      title: "Create user",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params) => {
    try {
      const id = await createUser(params);

      return {
        content: [{ type: "text", text: `User ${id} created successfully` }],
      };
    } catch {
      return {
        content: [{ type: "text", text: "Failed to save user" }],
      };
    }
  }
);

server.registerPrompt(
  "generate-fake-user",
  {
    title: "Generate Fake User",
    description: "Generate a fake user based on a given name",
    argsSchema: {
      name: z.string(),
    },
  },
  ({ name }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate a fake user with the name ${name}. The user should have a realistic email, address, and phone number.`,
          },
        },
      ],
    };
  }
);

// Prompt with context-aware completion
server.registerPrompt(
  "user-greeting",
  {
    title: "User Greeting",
    description: "Generate a greeting for user members",
    argsSchema: {
      department: completable(z.string(), (value) => {
        // Department suggestions
        return ["engineering", "sales", "marketing", "support"].filter((d) =>
          d.startsWith(value)
        );
      }),
      name: completable(z.string(), (value, context) => {
        // Name suggestions based on selected department
        const department = context?.arguments?.["department"];
        if (department === "engineering") {
          return ["Alice", "Bob", "Charlie"].filter((n) => n.startsWith(value));
        } else if (department === "sales") {
          return ["David", "Eve", "Frank"].filter((n) => n.startsWith(value));
        } else if (department === "marketing") {
          return ["Grace", "Henry", "Iris"].filter((n) => n.startsWith(value));
        }
        return ["Guest"].filter((n) => n.startsWith(value));
      }),
    },
  },
  ({ department, name }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Hello ${name}, welcome to the ${department}! Department`,
        },
      },
    ],
  })
);

// sampling
server.registerTool(
  "create-random-user",
  {
    title: "Create a random user",
    description: "Create a random user with fake data",
    annotations: {
      title: "Create random user",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async () => {
    const res = await server.server.request(
      {
        // send request directlly to client
        method: "sampling/createMessage",
        params: {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "Generate fake user data. The user should have a realistic name, email, address, and phone number. Return this data as a JSON object with no other text or formatter so it can be used with JSON.parse.",
              },
            },
          ],
          maxTokens: 1024,
        },
      },
      CreateMessageResultSchema
    );

    if (res.content.type !== "text") {
      return {
        content: [{ type: "text", text: "Failed to generate user data" }],
      };
    }

    try {
      const fakeUser = JSON.parse(
        res.content.text
          .trim()
          .replace(/^```json/, "")
          .replace(/```$/, "")
          .trim()
      );
      const id = await createUser(fakeUser);
      return {
        content: [{ type: "text", text: `User ${id} created successfully` }],
      };
    } catch {
      return {
        content: [{ type: "text", text: "Failed to generate user data" }],
      };
    }
  }
);

async function createUser(user: {
  name: string;
  email: string;
  address: string;
  phone: string;
}) {
  const users = await import("./data/users.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  const id = users.length + 1;

  users.push({ id, ...user });

  await fs.writeFile("./src/data/users.json", JSON.stringify(users, null, 2));
  return id;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
