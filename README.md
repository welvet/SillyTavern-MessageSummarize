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
- If you want to add the extension to an existing chat, summarization might take awhile. The extension will only summarize messages until it reaches the desired limits, and you can stop it at any time.


### Usage
- Install the extension
- Any new assistant message will be automatically summarized.
- To mark a memory for long-term memory, click the "brain" icon in the message button menu.
- To re-summarize a message, click the "quill" icon in the message button menu.
- To edit a summary, click on the summary text or click the "pencil" icon in the message button menu.


### Notable Features
- Automatically handles swiping, editing, and deleting messages.
- Popout config menu - customize summarization settings, injection settings, and message inclusion criteria
- Configuration profiles - save and load different configurations profiles and set one to be auto-loaded for each character.
- Summaries are optionally displayed in small text below each message, colored according to their status:
  - Green: Included in short-term memory
  - Blue: Marked for long-term memory (included in short-term or long-term memory)
  - Red: Marked for long-term memory, but now out of context.

### Todo
- ~~Handle swiping, editing, and deleting summaries~~
- ~~button to resummarize a given message~~
- ~~Display summaries below each message~~
- ~~config profiles, and allow character-specific settings to be saved~~
- ~~ability to stop summarization at any time~~
- ~~Support stepped thoughts extension~~
- ~~Added ability to provide global macros in summarization prompt~~
- ~~Added the ability to choose whether to nest the messages in the summarization prompt or not~~
- Fix issue that is sometimes inadvertently changing the completion config max tokens for some reason.
- Fix issue causing the popout to be destroyed when pressing escape.
- ~~Ability to edit summaries.~~
- Figure out how to limit the number of regular chat messages injected into the prompt so they can be replaced by the summaries.
- support group chats
- ~~add macro for max words to use in the summary prompt~~
- Set the frequency at which automatic summarizations occur (every X messages)
- Allow disabling extension in individual chats without giving it a profile.
- Maybe include a few previous messages (or summaries) in the summary prompt, and specify that it should only include NEW events? 
This could aid in consistency and avoid duplicate info. Might also have to opposite effect though.
- Add a button to transfer all summaries marked for long-term memory into a lorebook entry
- Custom exclusion criteria for messages?
- Need to detect when more messages are loaded into the chat via the "load more message" button, and update the message visuals to display any memories on them. Annoyingly, no event seems to be fired when the chat updates this way (that I could find).


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


### Recommended Summarization Prompts
The default prompt works for me, but others have needed to tweak it for their use-case or model.
Try them out and see what works best.

- Default: "You are a summarization assistant. Summarize the given fictional narrative in a single, very short and concise statement of fact.
State only events that will need to be remembered in the future.
Include names when possible.
Response must be in the past tense.
Maintain the same point of view as the text (i.e. if the text uses "you", use "your" in the response). If an observer is unspecified, assume it is "you".
Your response must ONLY contain the summary. If there is nothing worth summarizing, do not respond.
Text to Summarize:"

Other Options:
"[SYSTEM INFO: You are a summary assistant. Summarize the chat history in a single, very short and concise statement of fact. Include names and state only events or decisions that characters will need to remember in the future. Do not include background information. Limit the summary to 50 words or less. Your response should contain only the summary.]
Background Information (informational only):
{{scenario}}
{{description}}
{{scenario}}"



