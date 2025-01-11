### Improved Summarization
- This extension reworks how memory is stored by summarizing each message individually, rather than all at once.
- Summaries are injected into the prompt at two levels: short-term memory and long-term memory.
- Short term memory rotates out the most recent message summaries automatically.
- Long-term memory stores summaries of manually-marked messages beyond the short-term memory.

Pros:
- Summarizing messages individually gets more accurate summaries, less likely to miss details.
- Short-term memory guarantees that relevant info is always available from the most recent messages, but goes away once reaching the desired limit.
- Long-term memory allows you to choose which details are important to remember, keeping them available for longer, up to a separate limit.
- Summarization occurs automatically after a message is generated, so if your model generates faster than you read you'll never have to wait.

Cons, with attempted solutions:
- If you use Context Shifting, performing the summarizations on each message breaks it. To reduce this, have added a feature that allows you to define a batch size, summarizing multiple messages at once (still one at a time).
- If a message is too small, it may not be relevant at all. I've added a config setting to exclude messages under a given token length.
- If a summarization is wrong, it can affect subsequent messages. I've added the ability to regenerate a summary or manually edit it if needed.
- Summarizing a single message can sometimes miss important context from previous messages. I've added the ability to include a few previous messages (and/or summaries) in the summarization prompt as context.
- If you want to add the extension to an existing chat, initial summarization of the chat might take a while. You can stop summarization at any time by clicking the "stop" button next to the progress bar.


### Usage
- Install the extension in ST using the github link.
- To mark a memory for long-term memory, click the "brain" icon in the message button menu.
- To re-summarize a message, click the "Quote" icon in the message button menu.
- To edit a summary, click on the summary text directly or click the "pen" icon in the message button menu.
- To summarize an existing chat, go to the config and click the "Summarize Chat" button next to the "Summarization" section (two curved arrows).


### Notable Features
- Handles swiping, editing, and deleting messages.
- Popout config menu - customize summarization settings, injection settings, and auto-summarization message inclusion criteria.
- Configuration profiles - save and load different configurations profiles and set one to be auto-loaded for each character.
- Summaries are optionally displayed in small text below each message, colored according to their status:
  - Green: Included in short-term memory
  - Blue: Marked for long-term memory (included in short-term or long-term memory)
  - Red: Marked for long-term memory, but now out of context.
  - Grey: Excluded

### Todo
- ~~Handle swiping, editing, and deleting summaries~~
- ~~button to resummarize a given message~~
- ~~Display summaries below each message~~
- ~~config profiles, and allow character-specific settings to be saved~~
- ~~ability to stop summarization at any time~~
- ~~Support stepped thoughts extension~~
- ~~Added ability to provide global macros in summarization prompt~~
- ~~Added the ability to choose whether to nest the messages in the summarization prompt or not~~
- ~~Added the ability to toggle automatic summarization on message edit and swipe/regenerate~~
- ~~Added summarization delay option~~
- Fix issue that is sometimes inadvertently changing the completion config max tokens when reloading for some reason???
- ~~Fix issue causing the popout to bug out when pressing escape.~~
- ~~Ability to edit summaries.~~
- ~~Figure out how to limit the number of regular chat messages injected into the prompt so they can be replaced by the summaries.~~
- ~~Move the prompt editing text areas to separate modals~~
- ~~support group chats~~
- ~~Add macro for max words to use in the summary prompt~~
- ~~Set the frequency at which automatic summarizations occur (every X messages)~~
- ~~Allow disabling extension in individual chats without giving it a profile.~~
- ~~Add option to include a few previous messages/summaries in the summary prompt as context~~
- ~~Progress bar for summarization of chat history~~
- Add a button to transfer all summaries marked for long-term memory into a lorebook entry
- Need to detect when more messages are loaded into the chat via the "load more message" button, and update the message visuals to display any memories on them. Annoyingly, no event seems to be fired when the chat updates this way (that I could find).
- option to cascade summary edits when previous summaries are included in the summary prompt?

### Troubleshooting:

- "ForbiddenError: invalid csrf token": You opened ST in multiple tabs.

- "Syntax Error: No number after minus sign in JSON at position X": update your koboldcpp, or try disabling "Request token probabilities".

- Just updated and things are broken: try reloading the page. If that fails, you can try using the "/hard_reset" command, but it WILL DELETE YOUR CONFIG PROFILES.

- Summaries seem to be continuing the conversation rather than summarizing: probably an issue with your instruct template.
Make sure you are using the correct template for your model, and make sure that system messages are properly distinct from user messages (the summaries use a system prompt). 
This can be caused by the "System same as user" checkbox in your instruct template settings, which will cause all system messages to be treated like a user - uncheck that.
You can also try unchecking "Nest Message in Summary Prompt" in the settings - some models behave better with this off.

- My jailbreak isn't working: You'll need to put the jailbreak in the summarization prompt if you want it to be included.

If it's something else, please turn on "Debug Mode" in the settings and send me the output logs from your browser console and raise an issue or message on discord.


