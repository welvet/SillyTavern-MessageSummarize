import { getStringHash, debounce, waitUntilCondition, extractAllWords, isTrueBoolean } from '../../../utils.js';
import { getContext, getApiUrl, extension_settings, doExtrasFetch, modules, renderExtensionTemplateAsync } from '../../../extensions.js';
import {
    activateSendButtons,
    deactivateSendButtons,
    animation_duration,
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    generateQuietPrompt,
    is_send_press,
    saveSettingsDebounced,
    substituteParamsExtended,
    generateRaw,
    getMaxContextSize,
    setExtensionPrompt,
    streamingProcessor,
    stopGeneration,
} from '../../../../script.js';
import { is_group_generating, selected_group } from '../../../group-chats.js';
import { loadMovingUIState } from '../../../power-user.js';
import { dragElement } from '../../../RossAscends-mods.js';
import { getTextTokens, getTokenCount, tokenizers } from '../../../tokenizers.js';
import { debounce_timeout } from '../../../constants.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { MacrosParser } from '../../../macros.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
export { MODULE_NAME };

// THe module name modifies where settings are stored, where information is stored on message objects, macros, etc.
const MODULE_NAME = 'qvink_memory';
const MODULE_DIR = `scripts/extensions/third-party/${MODULE_NAME}`;
const MODULE_NAME_FANCY = 'Qvink Memory';

// CSS classes (must match the CSS file because I'm too stupid to figure out how to do this properly)
const css_message_div = "qvink_memory_display"
const css_short_memory = "qvink_short_memory"
const css_long_memory = "qvink_long_memory"
const css_remember_memory = "qvink_remember_memory"
const global_div_class = `${MODULE_NAME}_item`;  // class put on all added divs to identify them


// Macros for long-term and short-term memory injection
const long_memory_macro = `${MODULE_NAME}_long_memory`;
const short_memory_macro = `${MODULE_NAME}_short_memory`;

// Settings
const defaultPrompt = `Summarize the given fictional narrative in a single, very short and concise statement of fact.
State only events that will need to be remembered in the future.
Include names when possible.
Response must be in the past tense.
Maintain the same point of view as the text (i.e. if the text uses "you", use "your" in the response). If an observer is unspecified, assume it is "you".
Your response must ONLY contain the summary. If there is nothing worth summarizing, do not respond.`;
const default_long_template = `[Following is a list of events that occurred in the past]:\n{{${long_memory_macro}}}`
const default_short_template = `[Following is a list of recent events]:\n{{${short_memory_macro}}}`
const defaultSettings = {
    auto_summarize: true,   // whether to automatically summarize chat messages
    include_world_info: false,  // include world info in context when summarizing
    prompt: defaultPrompt,
    long_template: default_long_template,
    short_template: default_short_template,
    block_chat: false,  // block input when summarizing
    message_length_threshold: 10,  // minimum message token length for summarization
    summary_maximum_length: 20,  // maximum token length of the summary
    include_user_messages: false,  // include user messages in summarization
    include_names: false,  // include sender names in summary prompt
    debug_mode: false,  // enable debug mode
    lorebook_entry: null,  // lorebook entry to dump memories to
    display_memories: true,  // display memories in the chat below each message

    long_term_context_limit: 10,  // percentage of context size to use as long-term memory limit
    short_term_context_limit: 10,  // percentage of context size to use as short-term memory limit

    long_term_position: extension_prompt_types.IN_PROMPT,
    long_term_role: extension_prompt_roles.SYSTEM,
    long_term_depth: 2,
    long_term_scan: false,

    short_term_position: extension_prompt_types.IN_PROMPT,
    short_term_depth: 2,
    short_term_role: extension_prompt_roles.SYSTEM,
    short_term_scan: false,

    stop_summarization: false  // toggled to stop summarization, then toggled back to false.
};


// Utility functions
function log(message) {
    console.log(`[${MODULE_NAME_FANCY}]`, message);
}
function debug(message) {
    if (get_settings('debug_mode')) {
        log("[DEBUG] "+message);
    }
}
function error(message) {
    log("[ERROR] "+message);
}

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);

function initialize_settings() {
    extension_settings[MODULE_NAME] = extension_settings[MODULE_NAME] || defaultSettings;
}
function set_settings(key, value) {
    // Set a setting for the extension and save it
    extension_settings[MODULE_NAME][key] = value;
    saveSettingsDebounced();
    debug(`Setting [${key}] updated to [${value}]`);
}
function get_settings(key) {
    // Get a setting for the extension, or the default value if not set
    return extension_settings[MODULE_NAME]?.[key] ?? defaultSettings[key];
}

function count_tokens(text, padding = 0) {
    // count the number of tokens in a text
    return getTokenCount(text, padding);
}
function get_context_size() {
    // Get the current context size
    return getMaxContextSize();
}
function get_long_token_limit() {
    // Get the long-term memory token limit, given the current context size and settings
    let long_term_context_limit = get_settings('long_term_context_limit');
    let context_size = get_context_size();
    return Math.floor(context_size * long_term_context_limit/100);
}
function get_short_token_limit() {
    // Get the short-term memory token limit, given the current context size and settings
    let short_term_context_limit = get_settings('short_term_context_limit');
    let context_size = get_context_size();
    return Math.floor(context_size * short_term_context_limit/100);
}


/**
 * Bind a UI element to a setting.
 * @param selector {string} jQuery Selector for the UI element
 * @param key {string} Key of the setting
 * @param type {string} Type of the setting (number, boolean)
 */
function bind_setting(selector, key, type=null) {
    // Bind a UI element to a setting, so if the UI element changes, the setting is updated
    let element = $(selector);

    // if no elements found, log error
    if (element.length === 0) {
        error(`No element found for selector [${selector}] for setting [${key}]`);
        return;
    }

    // default trigger for a settings update is on a "change" event
    let trigger = 'change';

    // If a textarea, instead make every keypress triggers an update
    if (element.is('textarea')) {
        trigger = 'input';
    }

    // detect if it's a radio button group
    let radio = false
    if (element.is('input[type="radio"]')) {
        trigger = 'change';
        radio = true;
    }

    // get the setting value
    let setting_value = get_settings(key);

    // initialize the UI element with the setting value
    if (radio) {  // if a radio group, select the one that matches the setting value
        let selected = element.filter(`[value="${setting_value}"]`)
        if (selected.length === 0) {
            error(`Error: No radio button found for value [${setting_value}] for setting [${key}]`);
            return;
        }
        selected.prop('checked', true);
    } else {  // otherwise, set the value directly
        if (type === 'boolean') {  // checkbox
            element.prop('checked', setting_value);
        } else {  // text input or dropdown
            element.val(setting_value);
        }
    }

    // Make the UI element update the setting when changed
    element.on(trigger, function (event) {
        let value;
        if (type === 'number') {  // number input
            value = Number($(this).val());
        } else if (type === 'boolean') {  // checkbox
            value = Boolean($(this).prop('checked'));
        } else {  // text input or dropdown
            value = $(this).val();
        }

        // update the setting
        set_settings(key, value)

        // refresh memory state (update message inclusion criteria, etc)
        if (trigger === 'change') {
            refresh_memory();
        } else if (trigger === 'input') {
            refresh_memory_debounced();  // debounce the refresh for input elements
        }
    });
}
function bind_function(id, func) {
    // bind a function to an element (typically a button or input)
    let element = $(id);
    if (element.length === 0) {
        error(`No element found for selector [${id}] when binding function`);
        return;
    }

    // check if it's an input element, and bind a "change" event if so
    if (element.is('input')) {
        element.on('change', function (event) {
            func(event);
        });
    } else {  // otherwise, bind a "click" event
        element.on('click', function (event) {
            func(event);
        });
    }
}


// UI functions
function set_memory_display(text='') {
    let display = $('#memory_display');
    display.val(text);
    display.scrollTop(display[0].scrollHeight);
}
function on_restore_prompt_click() {
    $('#prompt').val(defaultPrompt).trigger('input');
}
function update_message_visuals(i, style=true, text=null) {
    // Update the message visuals according to its current memory status
    // Each message div will have a div added to it with the memory for that message.
    // Even if there is no memory, I add the div because otherwise the spacing changes when the memory is added later.

    let chat = getContext().chat;
    let message = chat[i];
    let memory = get_memory(message, 'memory');
    let include = get_memory(message, 'include');
    let error = get_memory(message, 'error');
    let remember = get_memory(message, 'remember');

    // it will have an attribute "mesid" that is the message index
    let div_element = $(`div[mesid="${i}"]`);
    if (div_element.length === 0) {
        error(`Could not find message element for message ${i} while updating message visuals`);
        return
    }

    // remove any existing added divs
    div_element.find(`div.${global_div_class}`).remove();

    // If setting isn't enabled, don't display memories
    if (!get_settings('display_memories')) {
        return
    }

    // get the div holding the main message text
    let message_element = div_element.find('div.mes_text');

    let style_class = ''
    if (style) {
        if (remember && include) {  // marked to be remembered and included in memory anywhere
            style_class = css_long_memory
        } else if (include === "short") { // not marked to remember, but included in short-term memory
            style_class = css_short_memory
        } else if (remember) {  // marked to be remembered but not included in memory
            style_class = css_remember_memory
        }
    }

    // if no text is provided, use the memory text
    if (!text) {
        text = ""  // default text when no memory
        if (memory) {
            text = `Memory: ${memory}`
        } else if (error) {
            style_class = ''  // clear the style class if there's an error
            text = `Error: ${error}`
        }
    }

    // Insert a new div right after that for the summary
    message_element.after(`<div class="${global_div_class} ${css_message_div} ${style_class}">${text}</div>`);
}
function scroll_to_bottom_of_chat() {
    // Scroll to the bottom of the chat
    let chat = $('#chat');
    chat.scrollTop(chat[0].scrollHeight);
}

function initialize_message_buttons() {
    // Add the message buttons to the chat messages

    let remember_button_class = `${MODULE_NAME}_remember_button`
    let summarize_button_class = `${MODULE_NAME}_summarize_button`

    let remember_button = $(`<div title="Remember (toggle)" class="mes_button ${remember_button_class} fa-solid fa-brain interactable" tabindex="0"></div>`);
    let summarize_button = $(`<div title="Summarize" class="mes_button ${summarize_button_class} fa-solid fa-feather interactable" tabindex="0"></div>`);

    $("#message_template .mes_buttons .extraMesButtons").prepend(summarize_button);
    $("#message_template .mes_buttons .extraMesButtons").prepend(remember_button);

    // button events
    $(document).on("click", `.${remember_button_class}`, async function () {
        const messageBlock = $(this).closest(".mes");
        const messageId = Number(messageBlock.attr("mesid"));
        remember_message_toggle(messageId);
    });
    $(document).on("click", `.${summarize_button_class}`, async function () {
        const messageBlock = $(this).closest(".mes");
        const messageId = Number(messageBlock.attr("mesid"));
        await summarize_message(messageId, true);  // summarize the message, replacing the existing summary
        refresh_memory();
    });
}


// Memory functions
function store_memory(message, key, value) {
    // store information on the message object
    if (!message.extra) {
        message.extra = {};
    }
    if (!message.extra[MODULE_NAME]) {
        message.extra[MODULE_NAME] = {};
    }

    message.extra[MODULE_NAME][key] = value;
    saveChatDebounced();
}
function get_memory(message, key) {
    // get information from the message object
    return message.extra?.[MODULE_NAME]?.[key];
}

async function remember_message_toggle(index=null) {
    // Toggle the "remember" status of a message
    let context = getContext();

    // Default to the last message, min 0
    index = Math.max(index ?? context.chat.length-1, 0)

    // toggle
    let message = context.chat[index]
    store_memory(message, 'remember', !get_memory(message, 'remember'));

    let new_status = get_memory(message, 'remember')
    debug(`Set message ${index} remembered status: ${new_status}`);

    if (new_status) {  // if it was marked as remembered, summarize if it there is no summary
        await summarize_message(messageId, false);
    }
    refresh_memory();
}


// Inclusion / Exclusion criteria
function check_message_exclusion(message) {
    // check for any exclusion criteria for a given message

    // first check if it has been marked to be remembered by the user - if so, it bypasses all exclusion criteria
    if (get_memory(message, 'remember')) {
        return true;
    }

    // check if it's a user message
    if (!get_settings('include_user_messages') && message.is_user) {
        return false
    }

    // check if it's a system (hidden) message
    if (message.is_system) {
        return false;
    }

    // Check if the message is too short
    let token_size = count_tokens(message.mes);
    if (token_size < get_settings('message_length_threshold')) {
        return false
    }

    return true;
}

function update_message_inclusion_flags() {
    // Update all messages in the chat, flagging them as short-term or long-term memories to include in the injection.
    // This has to be run on the entire chat since it needs to take the context limits into account.
    let context = getContext();
    let chat = context.chat;

    // iterate through the chat in reverse order and mark the messages that should be included in short-term and long-term memory
    let short_limit_reached = false;
    let long_limit_reached = false;
    let long_term_end_index = null;  // index of the most recent message that doesn't fit in short-term memory
    let end = chat.length - 1;
    for (let i = end; i >= 0; i--) {
        let message = chat[i];

        // check for any of the exclusion criteria
        let include = check_message_exclusion(message)
        if (!include) {
            store_memory(message, 'include', null);
            continue;
        }

        // if it doesn't have a memory on it, don't include it
        if (!get_memory(message, 'memory')) {
            store_memory(message, 'include', null);
            continue;
        }

        if (!short_limit_reached) {  // short-term limit hasn't been reached yet
            let short_memory_text = concatenate_summaries(i, end);  // add up all the summaries down to this point
            let short_token_size = count_tokens(short_memory_text);
            if (short_token_size > get_short_token_limit()) {  // over context limit
                short_limit_reached = true;
                long_term_end_index = i;  // this is where long-term memory ends and short-term begins
            } else {  // under context limit
                store_memory(message, 'include', 'short');  // mark the message as short-term
                continue
            }
        }

        // if the short-term limit has been reached, check the long-term limit
        let remember = get_memory(message, 'remember');
        if (!long_limit_reached && remember) {  // long-term limit hasn't been reached yet and the message was marked to be remembered
            let long_memory_text = concatenate_summaries(i, long_term_end_index, false, true)  // get all messages marked for remembering in long-term memory
            let long_token_size = count_tokens(long_memory_text);
            if (long_token_size > get_long_token_limit()) {  // over context limit
                long_limit_reached = true;
            } else {
                store_memory(message, 'include', 'long');  // mark the message as long-term
                continue
            }
        }

        // if we haven't marked it for inclusion yet, mark it as excluded
        store_memory(message, 'include', null);
    }

    // update the message visuals of each message, styled according to the inclusion criteria
    for (let i=chat.length-1; i >= 0; i--) {
        update_message_visuals(i, true);
    }
}

function concatenate_summaries(start=null, end=null, include=null, remember=null) {
    // Given a start and end, concatenate the summaries of the messages in that range
    // Excludes messages that don't meet the inclusion criteria

    let context = getContext();
    let chat = context.chat;

    // Default start is 0
    start = Math.max(start ?? 0, 0)

    // Default end is the last message
    end = Math.max(end ?? context.chat.length - 1, 0)

    // assert start is less than end
    if (start > end) {
        error('Cannot concatenate summaries: start index is greater than end index');
        return '';
    }

    // iterate through messages
    let summaries = [];
    for (let i = start; i <= end; i++) {
        let message = chat[i];

        // check against the message exclusion criteria
        if (!check_message_exclusion(message)) {
            continue;
        }

        // If an inclusion flag is provided, check if the message is marked for that inclusion
        if (include && get_memory(message, 'include') !== include) {
            continue;
        }
        if (remember && get_memory(message, 'remember') !== remember) {
            continue;
        }

        let summary = get_memory(message, 'memory');
        summaries.push(summary)
    }

    // Add an asterisk to the beginning of each summary and join them with newlines
    summaries = summaries.map((s) => `* ${s}`);
    return summaries.join('\n');
}

// Summarization
async function summarize_text(text) {
    text = ` ${get_settings('prompt')}\n\nText to Summarize:\n${text}`;

    // get size of text
    let token_size = count_tokens(text);

    let context_size = get_context_size();
    if (token_size > context_size) {
        error(`Text ${token_size} exceeds context size ${context_size}.`);
    }

    let include_world_info = get_settings('include_world_info');
    if (include_world_info) {
        /**
         * Background generation based on the provided prompt.
         * @param {string} quiet_prompt Instruction prompt for the AI
         * @param {boolean} quietToLoud Whether the message should be sent in a foreground (loud) or background (quiet) mode
         * @param {boolean} skipWIAN whether to skip addition of World Info and Author's Note into the prompt
         * @param {string} quietImage Image to use for the quiet prompt
         * @param {string} quietName Name to use for the quiet prompt (defaults to "System:")
         * @param {number} [responseLength] Maximum response length. If unset, the global default value is used.
         * @returns
         */
        return await generateQuietPrompt(text, false, false, '', '', get_settings('summary_maximum_length'));
    } else {
        /**
         * Generates a message using the provided prompt.
         * @param {string} prompt Prompt to generate a message from
         * @param {string} api API to use. Main API is used if not specified.
         * @param {boolean} instructOverride true to override instruct mode, false to use the default value
         * @param {boolean} quietToLoud true to generate a message in system mode, false to generate a message in character mode
         * @param {string} [systemPrompt] System prompt to use. Only Instruct mode or OpenAI.
         * @param {number} [responseLength] Maximum response length. If unset, the global default value is used.
         * @returns {Promise<string>} Generated message
         */
        return await generateRaw(text, '', false, false, '', get_settings('summary_maximum_length'));
    }
}

/**
 * Summarize a message and save the summary to the message object.
 * @param index {number|null} Index of the message to summarize (default last message)
 * @param replace {boolean} Whether to replace existing summaries (default false)
 */
async function summarize_message(index=null, replace=false) {
    let context = getContext();

    // Default to the last message, min 0
    index = Math.max(index ?? context.chat.length - 1, 0)
    let message = context.chat[index]
    let message_hash = getStringHash(message.mes);

    // check message exclusion criteria first
    if (!await check_message_exclusion(message)) {
        return;
    }

    // If we aren't forcing replacement, check if the message already has a summary and the hash hasn't changed since last summarization
    if (!replace && get_memory(message, 'memory') && get_memory(message, 'hash') === message_hash) {
        debug(`Message ${index} already has a summary and hasn't changed since, skipping summarization.`);
        return;
    }

    // Temporarily update the message summary text to indicate that it's being summarized (no styling based on inclusion criteria)
    // A full visual update with style should be done on the whole chat after inclusion criteria have been recalculated
    update_message_visuals(index, false, "Summarizing...")

    // summarize it
    debug(`Summarizing message ${index}...`)
    let text = message.mes;

    // Add the sender name to the prompt if enabled
    if (get_settings('include_names')) {
        text = `[${message.name}]:\n${text}`;
    }

    let summary;
    let err = null;
    try {
        summary = await summarize_text(text)
    } catch (e) {
        if (e === "Clicked stop button") {  // summarization was aborted
            err = "Summarization aborted"
        } else {
            error(`Unrecognized error when summarizing message ${index}: ${e}`)
        }
        summary = null
    }

    if (summary) {
        debug("Message summarized: " + summary)
        store_memory(message, 'memory', summary);
        store_memory(message, 'hash', message_hash);  // store the hash of the message that we just summarized
    } else {  // generation failed
        error(`Failed to summarize message ${index} - generation failed.`);
        store_memory(message, 'error', err || "Summarization failed");  // store the error message
        store_memory(message, 'memory', null);  // clear the memory if generation failed
    }

    // update the message summary text again, still no styling
    update_message_visuals(index, false)
}


function get_long_memory() {
    // get the injection text for long-term memory
    return concatenate_summaries(null, null, "long");
}
function get_short_memory() {
    // get the injection text for short-term memory
    return concatenate_summaries(null, null, "short");
}

function refresh_memory() {
    // Update the UI according to the current state of the chat memories, and update the injection prompts accordingly
    update_message_inclusion_flags()  // update the inclusion flags for all messages
    let long_memory = get_long_memory();
    let short_memory = get_short_memory();

    let long_template = get_settings('long_template')
    let short_template = get_settings('short_template')

    let long_injection = substituteParamsExtended(long_template, { [long_memory_macro]: long_memory });
    let short_injection = substituteParamsExtended(short_template, { [short_memory_macro]: short_memory });

    setExtensionPrompt(`${MODULE_NAME}_long`,  long_injection,  get_settings('long_term_position'), get_settings('long_term_depth'), get_settings('long_term_scan'), get_settings('long_term_role'));
    setExtensionPrompt(`${MODULE_NAME}_short`, short_injection, get_settings('short_term_position'), get_settings('short_term_depth'), get_settings('short_term_scan'), get_settings('short_term_role'));

    set_memory_display(`${long_injection}\n\n${short_injection}`)  // update the memory display
}
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);

function stop_summarization() {
    // Immediately stop summarization of the chat
    set_settings('stop_summarization', true);  // set the flag to stop summarization of the chat
    stopGeneration();  // stop generation on current message
    log("Aborted summarization.")
}

async function summarize_chat(replace=false) {
    // Perform summarization on the entire chat, optionally replacing existing summaries
    log('Summarizing chat...')
    let context = getContext();

    // set "stop summarization" to false
    set_settings('stop_summarization', false);

    // optionally block user from sending chat messages while summarization is in progress
    if (get_settings('block_chat')) {
        deactivateSendButtons();
    }

    for (let i = context.chat.length-1; i >= 0; i--) {
        if (get_settings('stop_summarization')) {  // check if summarization should be stopped
            log('Summarization stopped');
            break;
        }
        await summarize_message(i, replace);
    }

    if (get_settings('stop_summarization')) {  // check if summarization was stopped
        set_settings('stop_summarization', false);  // reset the flag
    } else {  // summarization completed normally
        log('Chat summarized')
    }

    if (get_settings('block_chat')) {
        activateSendButtons();
    }
    refresh_memory()
}


// Event handling
async function onChatEvent(event=null) {
    // When the chat is updated, check if the summarization should be triggered
    debug("Chat updated, checking if summarization should be triggered... "+event)

    // if auto-summarize is not enabled, skip
    if (!get_settings('auto_summarize')) {
        debug("Automatic summarization is disabled.");
        return;
    }

    const context = getContext();

    // no characters or group selected
    if (!context.groupId && context.characterId === undefined) {
        return;
    }

    // Streaming in-progress
    if (streamingProcessor && !streamingProcessor.isFinished) {
        return;
    }

    switch (event) {
        case 'chat_changed':  // Chat or character changed
            debug('Chat or character changed');
            refresh_memory();
            break;
        case 'message_deleted':  // message was deleted
            debug("Message deleted, refreshing memory")
            refresh_memory();
            break;
        case 'new_message':  // New message detected
            debug("New message detected, summarizing")
            await summarize_chat(false);  // summarize the chat, but don't replace existing summaries
            break;
        case 'message_edited':  // Message has been edited
            debug("Message edited, summarizing")
            await summarize_chat(false);  // summarize the chat, but don't replace existing summaries UNLESS they changed since last summarization
            break;
        case 'message_swiped':  // when this event occurs, don't do anything (a new_message event will follow)
            debug("Message swiped, reloading memory")
            refresh_memory()
            break;
        default:
            debug("Unknown event, refreshing memory")
            refresh_memory();
    }
}

// UI handling
function setupListeners() {
    debug("Setting up listeners...")

    bind_function('#prompt_restore', on_restore_prompt_click);
    bind_function('#popout_button', (e) => {
        do_popout(e);
        e.stopPropagation();
    })
    bind_function('#rerun_memory', async (e) => {
        set_memory_display("Summarizing...");  // clear the memory display
        await summarize_chat(true);  // rerun summarization, replacing existing summaries
        refresh_memory();  // refresh the memory (and the display) when finished
    })
    bind_function('#refresh_memory', refresh_memory);
    bind_function('#stop_summarization', stop_summarization);

    // todo
    //bind_function('#dump_to_lorebook', dump_memories_to_lorebook);
    //bind_setting('#lorebook_entry', 'lorebook_entry')

    bind_setting('#auto_summarize', 'auto_summarize', 'boolean');
    bind_setting('#include_world_info', 'include_world_info', 'boolean');
    bind_setting('#block_chat', 'block_chat', 'boolean');
    bind_setting('#prompt', 'prompt');
    bind_setting('#include_user_messages', 'include_user_messages', 'boolean');
    bind_setting('#include_names', 'include_names', 'boolean');
    bind_setting('#message_length_threshold', 'message_length_threshold', 'number');
    bind_setting('#summary_maximum_length', 'summary_maximum_length', 'number');
    bind_setting('#debug_mode', 'debug_mode', 'boolean');
    bind_setting('#display_memories', 'display_memories', 'boolean')

    bind_setting('#short_template', 'short_template');
    bind_setting('#short_term_context_limit', 'short_term_context_limit', 'number');
    bind_setting('input[name="short_term_position"]', 'short_term_position');
    bind_setting('#short_term_depth', 'short_term_depth', 'number');
    bind_setting('#short_term_role', 'short_term_role');
    bind_setting('#short_term_scan', 'short_term_scan', 'boolean');

    bind_setting('#long_template', 'long_template');
    bind_setting('#long_term_context_limit', 'long_term_context_limit', 'number');
    bind_setting('input[name="long_term_position"]', 'long_term_position');
    bind_setting('#long_term_depth', 'long_term_depth', 'number');
    bind_setting('#long_term_role', 'long_term_role');
    bind_setting('#long_term_scan', 'long_term_scan', 'boolean');



    // update the displayed token limit when the input changes
    // Has to happen after the bind_setting calls, so changing the input sets the setting, then updates the display
    bind_function('#long_term_context_limit', () => {
        $('#long_term_context_limit_display').text(get_long_token_limit());
    })
    bind_function('#short_term_context_limit', () => {
        $('#short_term_context_limit_display').text(get_short_token_limit());
    })
    $('#long_term_context_limit').trigger('change');  // trigger the change event once to update the display at start
    $('#short_term_context_limit').trigger('change');
}

function do_popout(e) {
    // popout the memory display
    const target = e.target;


    if ($('#qmExtensionPopout').length === 1) {  // Already open - close it
        debug('saw existing popout, removing');
        $('#qmExtensionPopout').fadeOut(animation_duration, () => { $('#qmExtensionPopoutClose').trigger('click'); });
        return
    }

    // repurposes the zoomed avatar template to server as a floating div
    debug('did not see popout yet, creating');
    const originalHTMLClone = $(target).parent().parent().parent().find('.inline-drawer-content').html();
    const originalElement = $(target).parent().parent().parent().find('.inline-drawer-content');
    const template = $('#zoomed_avatar_template').html();
    const controlBarHtml = `<div class="panelControlBar flex-container">
    <div id="qmExtensionPopoutheader" class="fa-solid fa-grip drag-grabber hoverglow"></div>
    <div id="qmExtensionPopoutClose" class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
    </div>`;
    const newElement = $(template);
    newElement.attr('id', 'qmExtensionPopout')
        .removeClass('zoomed_avatar')
        .addClass('draggable')
        .empty();
    originalElement.empty();
    originalElement.html('<div class="flex-container alignitemscenter justifyCenter wide100p"><small>Currently popped out</small></div>');
    newElement.append(controlBarHtml).append(originalHTMLClone);
    $('body').append(newElement);
    $('#drawer_content').addClass('scrollableInnerFull');
    setupListeners();
    loadMovingUIState();

    $('#qmExtensionPopout').fadeIn(animation_duration);
    dragElement(newElement);

    //setup listener for close button to restore extensions menu
    $('#qmExtensionPopoutClose').off('click').on('click', function () {
        $('#drawer_content').removeClass('scrollableInnerFull');
        const summaryPopoutHTML = $('#drawer_content');
        $('#qmExtensionPopout').fadeOut(animation_duration, () => {
            originalElement.empty();
            originalElement.html(summaryPopoutHTML);
            $('#qmExtensionPopout').remove();
        });
    });
}

function dump_memories_to_lorebook() {
    // Dump all memories marked for remembering to a lorebook entry.
    let entry = get_settings('lorebook_entry');
    let lorebook = getCharacterLore();
    log("LOREBOOK: " + lorebook)

}

// Entry point
jQuery(async function () {
    log(`Loading extension...`)

    // Load settings
    initialize_settings();

    // Set up settings UI
    $("#extensions_settings2").append(await $.get(`${MODULE_DIR}/settings.html`));  // load html
    setupListeners();  // setup UI listeners

    // message buttons
    initialize_message_buttons();

    // Event listeners
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, () => onChatEvent('new_message'));
    eventSource.on(event_types.MESSAGE_DELETED, () => onChatEvent('message_deleted'));
    eventSource.on(event_types.MESSAGE_EDITED, () => onChatEvent('message_edited'));
    eventSource.on(event_types.MESSAGE_SWIPED,() => onChatEvent('message_swiped'));
    eventSource.on(event_types.CHAT_CHANGED, () => onChatEvent('chat_changed'));

    // Slash commands
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'log_chat',
        callback: (args) => {
            log("CHAT: ")
            log(getContext().chat)
        },
        helpString: 'log chat',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'remember',
        callback: (args) => {
            remember_message_toggle(args.index);
        },
        helpString: 'Toggle the remember status of a message',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                name: 'index',
                description: 'Index of the message to toggle',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    // Macros
    MacrosParser.registerMacro(short_memory_macro, () => get_short_memory());
    MacrosParser.registerMacro(long_memory_macro, () => get_long_memory());
});
