import { config } from "dotenv";
import { confirm, input, select } from "@inquirer/prompts";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CreateMessageRequestSchema,
  Prompt,
  PromptMessage,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenAI } from "@google/genai";

config();

const google = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const mcp = new Client(
  {
    name: "mcp-client",
    version: "1.0.0",
  },
  { capabilities: { sampling: {} } }
);

const transport = new StdioClientTransport({
  command: "node",
  args: ["build/server.js"],
  stderr: "ignore",
});

async function main() {
  await mcp.connect(transport);
  const [{ tools }, { prompts }, { resources }, { resourceTemplates }] =
    await Promise.all([
      mcp.listTools(),
      mcp.listPrompts(),
      mcp.listResources(),
      mcp.listResourceTemplates(),
    ]);

  // TO HANDLE 'SAMPLING' PART
  // handle any request that follows specific schema
  // here "CreateMessageRequestSchema" is used as an example
  mcp.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    const texts: string[] = [];

    for (const message of request.params.messages) {
      const text = await handleServerMessagePrompt(message);

      if (text != null) {
        texts.push(text);
      }
    }

    return {
      role: "user",
      model: "gemini-2.0-flash",
      stopReason: "endTurn",
      content: {
        type: "text",
        text: texts.join("\n"),
      },
    };
  });

  console.log("You're Connected");

  while (true) {
    const option = await select({
      message: "What would you like to do?",
      choices: ["Query", "Tools", "Resources", "Prompts"],
    });

    switch (option) {
      case "Tools":
        const toolName = await select({
          message: "Select a tool to run",
          choices: tools.map((tool) => ({
            name: tool.annotations?.title || tool.name,
            value: tool.name,
            description: tool.description,
          })),
        });

        const tool = tools.find((t) => t.name === toolName)!;
        if (tool == null) {
          console.error("Tool not found");
        } else {
          await handleTool(tool);
        }
        break;
      case "Resources":
        const resourceUri = await select({
          message: "Select a resource to run",
          choices: [
            ...resources.map((resource) => ({
              name: resource.name,
              value: resource.uri,
              description: resource.description,
            })),
            ...resourceTemplates.map((template) => ({
              name: template.name,
              value: template.uriTemplate,
              description: template.description,
            })),
          ],
        });

        const uri =
          resources.find((r) => r.uri === resourceUri)?.uri ??
          resourceTemplates.find((r) => r.uriTemplate === resourceUri)
            ?.uriTemplate;
        if (uri == null) {
          console.error("Resource not found");
        } else {
          await handleResource(uri);
        }

        break;
      case "Prompts":
        const promptName = await select({
          message: "Select a prompt",
          choices: prompts.map((prompt) => ({
            name: prompt.name,
            value: prompt.name,
            description: prompt.description,
          })),
        });
        const prompt = prompts.find((p) => p.name === promptName);
        if (prompt == null) {
          console.error("Prompt not found.");
        } else {
          await handlePrompt(prompt);
        }
        break;
      case "Query":
        await handleQuery(tools);
    }
  }
}

async function handleTool(tool: Tool) {
  const args: Record<string, any> = {};
  for (const [key, value] of Object.entries(
    tool.inputSchema.properties ?? {}
  )) {
    args[key] = await input({
      message: `Enter value for ${key} (${(value as { type: string }).type})`,
    });
  }

  const res = await mcp.callTool({
    name: tool.name,
    arguments: args,
  });

  console.log((res.content as [{ text: string }])[0].text);
}

async function handleResource(uri: string) {
  let finalUri = uri;
  const paramMatches = uri.match(/{([^}]+)}/g);

  /*  ex:
    const uri = "users://{userId}/profile/{section}";
    const paramMatches = uri.match(/{([^}]+)}/g);
    console.log(paramMatches);

    Output: [ '{userId}', '{section}' ]
*/

  if (paramMatches != null) {
    for (const paramMatch of paramMatches) {
      const paramName = paramMatch.replace("{", "").replace("}", "");
      const paramValue = await input({
        message: `Enter value for ${paramName}`,
      });
      finalUri = finalUri.replace(paramMatch, paramValue);
    }
  }
  const res = await mcp.readResource({
    uri: finalUri,
  });

  console.log(
    JSON.stringify(JSON.parse(res.contents[0].text as string), null, 2)
  );
}

async function handlePrompt(prompt: Prompt) {
  const args: Record<string, string> = {};
  for (const arg of prompt.arguments ?? []) {
    args[arg.name] = await input({
      message: `Enter value for ${arg.name}:`,
    });
  }

  const response = await mcp.getPrompt({
    name: prompt.name,
    arguments: args,
  });

  for (const message of response.messages) {
    console.log(await handleServerMessagePrompt(message));
  }
}

async function handleServerMessagePrompt(message: PromptMessage) {
  if (message.content.type !== "text") return;

  console.log(message.content.text);
  const run = await confirm({
    message: "Would you like to run the above prompt",
    default: true,
  });

  if (!run) return;

  const response = await google.models.generateContent({
    model: "gemini-2.0-flash",
    contents: message.content.text,
  });
  // console.log(response.candidates[0].content.parts[0].text);

  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text;
}

async function handleQuery(tools: Tool[]) {
  const query = await input({
    message: "Enter your query:",
  });

  // console.log(tools[0].inputSchema, "====");

  const funcTools = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: tool.inputSchema.type,
      properties: tool.inputSchema.properties,
      required: tool.inputSchema.required,
    },
  }));

  const response = await google.models.generateContent({
    model: "gemini-2.0-flash",
    contents: query,
    config: {
      tools: [
        {
          functionDeclarations: funcTools as [],
        },
      ],
    },
  });

  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const functionCall =
    response?.candidates?.[0]?.content?.parts?.[0]?.functionCall;

  if (functionCall) {
    const res = await mcp.callTool({
      name: functionCall.name as string,
      arguments: functionCall.args,
    });

    console.log((res.content as [{ text: string }])[0].text);
  }

  console.log(text || "No text generated");

  // console.log(response?.candidates, "----");
  // console.log(functionCall, "::::::");
}

main();
