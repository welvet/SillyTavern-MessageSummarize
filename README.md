### Improved Summarization
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


### Usage
- Install the extension in ST using the github link: https://github.com/qvink/qvink_memory
- To mark a message for long-term memory, click the "brain" icon in the message button menu.
- To re-summarize a message, click the "Quote" icon in the message button menu.
- To edit a summary, click on the summary text directly or click the "pen" icon in the message button menu.
- To summarize an existing chat, go to the config and click the "Mass re-summarization" button next to the "Summarization" section (two curved arrows).
- To only summarize certain characters in a group chat, open the group chat edit menu and scroll down to the member list. Click the glowing "brain" icon to toggle whether that character will be automatically summarized (if you have auto-summarization enabled).


### Notable Features
- Configuration profiles: save and load different configurations profiles and set one to be auto-loaded for each character.
- Popout config menu: customize summarization settings, injection settings, and auto-summarization message inclusion criteria.
- Handles swiping, editing, and deleting messages.
- Summaries are optionally displayed in small text below each message, colored according to their status:
  - Green: Included in short-term memory
  - Blue: Marked for long-term memory (included in short-term or long-term memory)
  - Red: Marked for long-term memory, but now out of context.
  - Grey: Excluded


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

### Changelog
#### v0.7.3
- **IMPORTANT:** You must be on ST version 1.12.12 or above as it relies on the following PRs:
  - https://github.com/SillyTavern/SillyTavern/pull/3327#issue-2803062094
  - https://github.com/SillyTavern/SillyTavern/pull/3331#issue-2803412920
  - https://github.com/SillyTavern/SillyTavern/pull/3430#issue-2831026016
- **New Feature**: You can now manually exclude a summarization from being injected without deleting it. A new button has been added to the message button menu to toggle the inclusion of the summary (labelled "Force Exclude"). Manually excluded summaries will be colored a darker grey color than automatically excluded summaries.
- **New Feature**: You can now prevent specific characters from being summarized in group chats. To do this, open the group chat panel and go down to where you would normally mute characters. Use the glowing brain icon to toggle whether a character will be summarized. Note that this is separate from config profiles, and will only apply to the group chat you are in.
- **New Feature**: Option to trigger auto-summarization immediately *before* a new message instead of *after* a new message. This is useful if you don't want to use message lag to prevent the most recent message from getting immediately summarized after it is received. The tradeoff between this and message lag is that with this setting you don't get the opportunity to edit the summary before it is injected for the next message, whereas with message lag the summary of the most recent message won't be generated until after the next message. An example use-case for this setting would be if you have set your "Message History Limit" to 0, meaning that your previous messages aren't injected into context at all and you are completely relying on summaries. But, you also want to save on generation tokens by waiting until you have finished editing/swiping to perform a summary of the most recent message. In this case, you can't use message lag because then the most recent summary wouldn't be present for context. Instead, you would need to use this setting to prevent the most recent message from getting immediately summarized while also ensuring that the summary is generated before the next message.
- **New Feature**: New button to copy all summaries in the entire chat to clipboard.
- **New Slash Command**: `/stop_summarization` -  same as the stop button, aborts any summarization currently running.
- **New Slash Command**: `/toggle_memory_popout` - toggles the memory config popout.
- **New Slash Command**: `/summarize <n>` - summarizes the given message index (default to most recent message)
- **New Slash Command**: `/get_memory_enabled` - returns whether the extension is enabled in the current chat.
- **New Slash Command**: `/force_exclude_memory <n>` - toggles the inclusion of the summary for the given message index, same as the new "Force Exclude" button.
- **New Menu Button**: You can now also toggle memory for the current chat in the wand menu.
- **Change**: Finally reworked the popout logic to fix the problem with the escape key. For real this time.
- **Change**: Message visuals now properly update retroactively when clicking "load more messages" for long chats.
- **Change**: Auto-summarize now immediately triggers a summarization on user message if the option is selected, instead of waiting until the character sends a message.
- **Change**: You guessed it, moved settings around again.
- **Change**: Moved the "summarize" message button away from the "remember" button to prevent accidentally re-summarizing a message when trying to mark it for long-term memory.
- **Change**: The `/toggle_memory` slash command can now take a boolean argument to toggle the extension on and off directly within the current chat.
- **Fix**: Fixed issue causing old swipes to not have their memory saved properly. The chat also now properly scrolls to the bottom when summarizing and swiping the most recent message to accommodate the space of the displayed memory.
- **Fix**: Fixed issue causing the most recent message's previous summary to be injected into the main prompt when swiping it.
- **Fix**: Fixed the `/remember` command not working properly when provided a message index.
- **Misc**: This changelog and previous versions are now present on the github page.


#### v0.7.1
- **IMPORTANT:** Your current profiles will be unbound from their characters, and you will need to re-lock them.
- **Change**: Changed how profiles are stored, now properly using character avatar paths instead of character_id to keep track of locked profiles. This means that your current profiles will be unbound from their characters, and you will need to re-lock them. Sorry about this, it shouldn't change again after this update unless ST makes an internal change.
- **Fix**: Fixing several bugs with the progress bar and adding a background to make it more readable.
- **Fix**: Fixing issue causing some config settings to not be applied properly in some circumstances.
- **New Feature**: Added option to specify a time delay (in seconds) between consecutive summarizations, useful for external APIs that have rate limit. Integrated with the progress bar, and stopping summarizing will also cancel the delay.

#### v0.6.0
- **IMPORTANT**: the summarization prompt now requires the **{{message}}** macro, and optionally the **{{history}}** macro. You can temporarily reset the templates to default settings to see how they are used.

- **Change**: I changed the settings UI again, sorry couldn't help it. Things were getting cluttered.
  - All prompt editing has been moved to separate popups
  - The "current memory state" has been moved to a separate popup
  - Moved "Summarization" section to the top, as it is probably be used the most
  - Some buttons shrunk down, some settings moved around

- **New feature**: Ability to add message history to summarization prompt using the {{history}} macro.
You can configure how many messages (and/or summaries) to add as context when summarizing a given message. 

- **Change**: The summarization prompt now requires the {{message}} macro to insert the message for summarization. If your prompt doesn't have it, it will automatically be inserted at the bottom.

- **New Feature**: New button to preview an example of the summarization prompt with everything filled into the instruct template. Useful for tweaking how the prompt is structured so you don't have to run a test generation and check the console.

- **New feature**: Ability to do summaries in "batches", specifying how many messages to wait before catching up. Summaries are still done one message at a time, but this means you don't have to wait after every single message.

- **New feature**: Progress bar added to show summarization progress (when more than 1 message is being summarized). Can be disabled for auto-summarization.

- **New feature**: The button in the config to re-summarize the chat now has a popup to select various inclusion options (only summarize messages without summaries, only re-summarize short-term memories, etc).
 
- **Change**: because of the new ability to add previous summarizations as context, summarizations now must occur in chronological order. There is now a config option to limit how far back auto-summarization will start (default 100 messages). This means that if you start summarizing on a fresh new chat, it will start 100 messages back unless you change the config setting.


#### v0.4.5
- **New Feature**: Added the ability to limit the number of messages sent in normal generations. By default it is -1 (disabled), but making this 4 for example would mean only 4 recent messages get sent when generating. The memories still get sent normally.
- **Change**: Reworked method used to "lock" a profile to specific characters. Now there is just a button to lock the currently selected profile (similar to how you lock a persona), instead of selecting it in a separate dropdown. Looks less cluttered I think.
- **Fix**: Made the default profile selection work with groups.
- **New Feature**: Added the ability to completely disable the extension on a chat-by-chat basis. Either use the button at the very top of the config, or use the /toggle_memory command.
- **New Feature**: Added option to have the extension disabled by default for newly created chats
- **New Feature**: Added an option to delay summarization by some number of messages.


### Troubleshooting:

- "ForbiddenError: invalid csrf token": You opened ST in multiple tabs.

- "Syntax Error: No number after minus sign in JSON at position X": update your koboldcpp, or try disabling "Request token probabilities".

- "min new tokens must be in (0, max_new_tokens(X)], got Y": your model has a minimum token amount, which is conflicting with the "Summarization Max Token Length" setting from this extension. Either reduce the minimum token amount (usually in the completion settings), or increase you Summarization Max Token Length.

- Summaries seem to be continuing the conversation rather than summarizing: probably an issue with your instruct template.
Make sure you are using the correct template for your model, and make sure that system messages are properly distinct from user messages (the summaries use a system prompt). 
This can be caused by the "System same as user" checkbox in your instruct template settings, which will cause all system messages to be treated like a user - uncheck that.
You can also try toggling "Nest Message in Summary Prompt" in the settings - some models behave better with this.

- My jailbreak isn't working: You'll need to put the jailbreak in the summarization prompt if you want it to be included.

- The summaries refer to "a person" or "someone" rather than the character by name: Try using the "Message History" setting to include a few previous messages in the summarization prompt to give the model a little more context.

- Just updated and things are broken: try reloading the page first, and make sure you are on the most recent version of ST. 

If it's something else, please turn on "Debug Mode" in the settings and send me the output logs from your browser console and raise an issue or message on discord.


### Known Issues
- When using a message limit, world info cooldown and sticky timed effects do not work properly. This is because the WI timed effects rely on the number of messages in the chat history during generation. I have not found a way around this yet.
- When editing a message that already has a memory, the memory displayed below the message does not have the right color. This is just a visual bug, and it will correct itself after the next summarization.

### Todo
- ~~Add button to force-exclude a summary from memory~~
- ~~Add slash command to return state of the extension and toggle it on and off~~
- Retrieve state of the auto-scroll chat setting and use for scrolling to the bottom
- Allow setting a number of tokens for context sizes directly.
- Slash command to retrieve a
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
- Maybe add an option to use different completion presets for the summarization.
  - This would completely replace the max token limit, instead allowing the user to select a completion preset.
  - Would need to find a way to retrieve the mak_tokens anyway for the {{words}} macro.
- ~~Need to detect when more messages are loaded into the chat via the "load more message" button, and update the message visuals to display any memories on them. Annoyingly, no event seems to be fired when the chat updates this way (that I could find).~~
  - ~~PR for event that triggers when more messages are loaded [here](https://github.com/SillyTavern/SillyTavern/pull/3331#issue-2803412920)~~


