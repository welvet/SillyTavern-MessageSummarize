### Improved Summarization
- This extension reworks how memory is stored by summarizing each message individually.
- Summaries are injected into the prompt at two levels: short-term memory and long-term memory.
- Short term memory rotates out the most recent message summaries automatically according to a set context limit.
- Long-term memory stores summaries of manually-marked messages beyond the short-term memory using a separate context limit.

### Current Features
- Messages are automatically summarized after being sent
- Handles swiping, editing, and deleting messages.
- Popout config menu; customize summarization settings, injection settings, and message inclusion criteria
- Summaries are optionally displayed in small text below each message, colored according to their status:
  - Green: Included in short-term memory
  - Blue: Marked for long-term memory (included in short-term or long-term memory)
  - Red: Marked for long-term memory, but now out of context.

### Todo
- Figure out how to limit the number of regular messages injected into the prompt so they can be replaced by the summaries.
- Ability to edit summaries from where they are displayed under the message
- Maybe include a few previous messages (or summaries) in the summary prompt, and specify that it should only include NEW events? This could aid in consistency and avoid duplicate info.
- Include an option to prepend the user's last message in the summary prompt as well.
- Add a button to transfer all summaries into a lorebook entry
