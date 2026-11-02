import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";

// A chat model that plays back a script, for testing the AI layer without a
// provider. Each call takes the next reply: text, a tool call, or an error.
// Replies report token usage, like real providers do.

export type Reply = { text: string } | { tool: string; args: Record<string, unknown> } | { error: Error & { status?: number } };

export const USAGE = { input_tokens: 1000, output_tokens: 200, total_tokens: 1200 };

export class ScriptedModel extends BaseChatModel {
  /** Every prompt the model was sent, in order. */
  seen: BaseMessage[][] = [];

  constructor(readonly script: Reply[]) {
    super({});
  }

  _llmType() {
    return "scripted";
  }

  // Tools are accepted and ignored: the script decides what's called.
  bindTools() {
    return this as never;
  }

  // Chunks, like real providers return (LangChain's structured-output parser expects one).
  private next(messages: BaseMessage[]): AIMessageChunk {
    this.seen.push(messages);
    const reply = this.script.shift();
    if (!reply) throw new Error("ScriptedModel ran out of replies");
    if ("error" in reply) throw reply.error;
    if ("tool" in reply)
      return new AIMessageChunk({
        content: "",
        tool_call_chunks: [{ id: `call_${this.seen.length}`, name: reply.tool, args: JSON.stringify(reply.args), index: 0, type: "tool_call_chunk" }],
        usage_metadata: USAGE,
      });
    return new AIMessageChunk({ content: reply.text, usage_metadata: USAGE });
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const message = this.next(messages);
    return { generations: [{ text: typeof message.content === "string" ? message.content : "", message }] };
  }

  async *_streamResponseChunks(messages: BaseMessage[]) {
    const message = this.next(messages);
    const text = typeof message.content === "string" ? message.content : "";
    const words = text.split(/(?<= )/);
    for (const [i, word] of words.entries()) {
      const last = i === words.length - 1 && !message.tool_calls?.length;
      yield new ChatGenerationChunk({ text: word, message: new AIMessageChunk({ content: word, ...(last ? { usage_metadata: USAGE } : {}) }) });
    }
    if (message.tool_calls?.length)
      yield new ChatGenerationChunk({
        text: "",
        message: new AIMessageChunk({
          content: "",
          tool_call_chunks: message.tool_calls.map((c, index) => ({ id: c.id, name: c.name, args: JSON.stringify(c.args), index, type: "tool_call_chunk" as const })),
          usage_metadata: USAGE,
        }),
      });
  }
}
