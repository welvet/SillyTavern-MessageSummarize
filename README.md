### Improved Summarization
- This extension reworks how memory is stored by summarizing each message individually.
- Summaries are injected into the prompt at two levels: short-term memory and long-term memory.
- Short term memory rotates out the most recent message summaries automatically.
- Long-term memory stores summaries of manually-marked messages beyond the short-term memory.

Pros:
- Summarizing message individually gets more accurate summaries, less likely to miss details.
- Short-term memory guarantees that relevant info is always available from the most recent messages, but goes away once reaching the desired limit.
- Long-term memory allows you to choose which details are important to remember, keeping them available for longer, up to a separate limit.
- Summarization occurs automatically after a message is generated, so if your model generates faster than you read you'll never have to wait.

Cons, with attempted solutions:
- If you use Context Shifting, performing the summarizations each time breaks it unless you include your static World Info in the summarization prompt. I've added this as a configuration option.
- If a message is too small, it is still summarized for short-term memory even if it isn't relevant. I've added a config setting to exclude messages under a given token length.
- If a summarization is wrong, it can affect subsequent messages. I've added a menu button to regenerate a summary if needed.


### Current Features
- Automatically handles swiping, editing, and deleting messages.
- Popout config menu - customize summarization settings, injection settings, and message inclusion criteria
- Summaries are optionally displayed in small text below each message, colored according to their status:
  - Green: Included in short-term memory
  - Blue: Marked for long-term memory (included in short-term or long-term memory)
  - Red: Marked for long-term memory, but now out of context.

### Todo
- Figure out how to limit the number of regular chat messages injected into the prompt so they can be replaced by the summaries.
- Ability to edit summaries from where they are displayed under the message
- Maybe include a few previous messages (or summaries) in the summary prompt, and specify that it should only include NEW events? This could aid in consistency and avoid duplicate info.
- Include an option to prepend the user's last message in the summary prompt as well.
- Add a button to transfer all summaries into a lorebook entry
