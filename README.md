### Description
- This extension reworks how memory is stored by summarizing each message individually, rather than all at once.
- Summaries are injected into the prompt at two levels: short-term memory and long-term memory.
- Short term memory rotates out the most recent message summaries automatically.
- Long-term memory stores summaries of manually-marked messages beyond the short-term limit.

Pros compared to the built-in summarization:
- Summarizing messages individually (as opposed to all at once) gets more accurate summaries and is less likely to miss details.
- Because each memory is stored separately, old summaries do not change when new ones are added.
- Each summary is attached to the message it summarizes, so deleting a message removes only the associated memory.
- Short-term memory guarantees that relevant info is always available from the most recent messages, but goes away once no longer relevant according to a set limit.
- Long-term memory allows you to choose which details are important to remember, keeping them available for longer, up to a separate limit.

Cons, with attempted solutions:
- If you use Context Shifting, performing the summarizations on each message breaks it. To reduce this, I have added a feature that allows you to define a batch size, summarizing multiple messages at once (still one at a time). This allows you to use context shifting for longer before summarizations occur.
- Summarizing a single message can sometimes miss important context from previous messages. I've added the ability to include a few previous messages (and/or summaries) in the summarization prompt as context.

### Notable Features
- Configuration profiles: save and load different configurations profiles and set one to be auto-loaded for each character.
- Popout config menu: customize summarization settings, injection settings, and auto-summarization message inclusion criteria.
- Handles swiping, editing, and deleting messages.
- Summaries are optionally displayed in small text below each message, colored according to their status:
  - Green: Included in short-term memory
  - Blue: Marked for long-term memory (included in short-term or long-term memory)
  - Red: Marked for long-term memory, but now out of context.
  - Grey: Excluded

### Usage
- Install the extension in ST using the github link: https://github.com/qvink/qvink_memory
- To mark a message for long-term memory, click the "brain" icon in the message button menu.
- To re-summarize a message, click the "Quote" icon in the message button menu.
- To edit a summary, click on the summary text directly or click the "pen" icon in the message button menu.
- To summarize an existing chat, go to the config and click the "Mass re-summarization" button next to the "Summarization" section (two curved arrows).
- To only summarize certain characters in a group chat, open the group chat edit menu and scroll down to the member list. Click the glowing "brain" icon to toggle whether that character will be automatically summarized (if you have auto-summarization enabled).

### How to use the Dev branch
ST doesn't have an easy way to switch extension branches, so you'll need to use git. 
In your command line, go to the folder where extension is stored.
This should look something like`SillyTavern/data/<user>/extensions/qvink_memory`.
Then run the following git commands in your command line:
- `git fetch origin dev:dev` (gets the dev branch info)
- `git checkout dev` (switch to the dev branch)

Then to switch back and forth, you can use `git checkout master` and `git checkout dev`.

To update the dev branch when changes are made, run:
- `git checkout dev` (make sure you are on the dev branch first)
- `git pull origin dev` (pull any new changes)

### Slash Commands
- `/get_memory_enabled`: Returns whether the extension is enabled in the current chat.
- `/toggle_memory`: Toggles the extension on and off for the current chat. Same as clicking "Toggle Chat Memory" in the config. Can also provide a boolean argument to toggle the extension directly.
- `/toggle_memory_display`: Toggles the display of summaries below each message. Same as clicking "Display Memories" in the config.
- `/toggle_memory_popout`: Toggles the popout config menu.
- `/summarize`: Summarizes the nth message in the chat (default to most recent message). Same as clicking the "quote" icon in the message button menu.
- `/summarize_chat`: Summarizes the entire chat, with some message exclusion options. Same as clicking the "Mass re-summarization" button in the config.
- `/stop_summarization`: stops any summarization currently running. Same as clicking the "stop" button in the config or next to the progress bar.
- `/remember`: Mark the nth message for long-term memory, summarizing it if not already. Same as clicking the "brain" icon in the message button menu.
- `/force_exclude_memory`: Toggles the inclusion of the summary for the nth message. Same as clicking the "Force Exclude" button in the message button menu.
- `/get_memory <n>`: Get the memory associated with a given message index. Defaults to the most recent message.


### Troubleshooting:

- "ForbiddenError: invalid csrf token": You opened ST in multiple tabs.

- "Syntax Error: No number after minus sign in JSON at position X": update your koboldcpp, or try disabling "Request token probabilities".

- "min new tokens must be in (0, max_new_tokens(X)], got Y": your model has a minimum token amount, which is conflicting with the "Summarization Max Token Length" setting from this extension. Either reduce the minimum token amount (usually in the completion settings), or increase you Summarization Max Token Length.

- Summaries seem to be continuing the conversation rather than summarizing: probably an issue with your instruct template.
Make sure you are using the correct template for your model, and make sure that system messages are properly distinct from user messages (the summaries use a system prompt). 
This can be caused by the "System same as user" checkbox in your instruct template settings, which will cause all system messages to be treated like a user - uncheck that.
Some default instruct templates also may not have anything defined for the "System message sequences" field - that should be filled out.
You can also try toggling "Nest Message in Summary Prompt" in the settings - some models behave better with this.

- My jailbreak isn't working: You'll need to put the jailbreak in the summarization prompt if you want it to be included.

- The summaries refer to "a person" or "someone" rather than the character by name: Try using the "Message History" setting to include a few previous messages in the summarization prompt to give the model a little more context.

- The summaries are too long: You can select a custom completion preset in the settings to use for summarizations, and that can be used to set a maximum token length after which generation will be cut off. You can also use the {{words}} macro in the summarization prompt to try and guide the LLM according to that token length, though LLMs cannot actually count words so it functions more like a suggestion.

- Just updated and things are broken: try reloading the page first, and make sure you are on the most recent version of ST. 

If it's something else, please turn on "Debug Mode" in the settings and send me the output logs from your browser console and raise an issue or message on discord.


### Known Issues
- When using a message limit, world info cooldown and sticky timed effects do not work properly. This is because the WI timed effects rely on the number of messages in the chat history during generation. I have not found a way around this yet.
- When editing a message that already has a memory, the memory displayed below the message does not have the right color. This is just a visual bug, and it will correct itself after the next summarization.

### Todo
- ~~Ability to choose a connection profile for summarization~~
- ~~Remove disabled group members from context~~
- ~~Option to use a global toggle state for chats~~
- ~~Fix reported freezing issue for chats with 30k+ messages~~
- ~~Add button to force-exclude a summary from memory~~
- ~~Add slash command to return state of the extension and toggle it on and off~~
- ~~Allow setting a number of tokens for context sizes directly.~~
- ~~Slash command to retrieve a memory by index~~
- Standardize the slash command naming once we have a few more.
- ~~Handle swiping, editing, and deleting summaries~~
- ~~button to re-summarize a given message~~
- ~~Display summaries below each message~~
- ~~config profiles, and allow character-specific settings to be saved~~
- ~~ability to stop summarization at any time~~
- ~~Support stepped thoughts extension~~
- ~~Added ability to provide global macros in summarization prompt~~
- ~~Added the ability to choose whether to nest the messages in the summarization prompt or not~~
- ~~Added the ability to toggle automatic summarization on message edit and swipe/regenerate~~
- ~~Added summarization delay option~~
- ~~Fix issue that is sometimes inadvertently changing the completion config max tokens when reloading for some reason???~~
  - ~~Turns out to be an issue with ST. Issue raised [here](https://github.com/SillyTavern/SillyTavern/issues/3297#issue-2782705578)~~
  - ~~potential fix merged into staging branch [here](https://github.com/SillyTavern/SillyTavern/pull/3301).~~
- ~~Fix issue causing the popout to bug out when pressing escape.~~
- ~~Figure out how to limit the number of regular chat messages injected into the prompt so they can be replaced by the summaries.~~
- ~~Move the prompt editing text areas to separate modals~~
- ~~support group chats~~
- ~~Add macro for max words to use in the summary prompt~~
- ~~Set the frequency at which automatic summarizations occur (e.g. every X messages)~~
- ~~Allow disabling extension in individual chats without giving it a profile.~~
- ~~Add option to include a few previous messages/summaries in the summary prompt as context~~
- ~~Progress bar for summarization of chat history~~
- ~~Add option to select which characters are summarized in a group~~
- ~~Add slash command to toggle popout~~
- ~~Add slash command to stop summarization~~
- ~~Add a delay option to slow down summarization (to handle rate limits for external APIs)~~
- ~~Maybe add an option to use different completion presets for the summarization.~~
- ~~Need to detect when more messages are loaded into the chat via the "load more message" button, and update the message visuals to display any memories on them. Annoyingly, no event seems to be fired when the chat updates this way (that I could find).~~
  - ~~PR for event that triggers when more messages are loaded [here](https://github.com/SillyTavern/SillyTavern/pull/3331#issue-2803412920)~~
- ~~Ability to turn off summaries being displayed, but still view them on a given message.~~
- ~~Ability to modify memory directly without visiting each message~~
- ~~Add option for summary prefill~~
- ~~Sentence trimming for summaries.~~
- ~~fix using is_system instead of extra.type === system_message_types.NARRATOR~~
- ~~Allow customizing the memory injection separators~~
- ~~Allow locking profile to specific chat, not just character.~~
- Option to remove redundant memory injections while messages are in context.
- import/export profiles
- Edit interface
  - find-replace
