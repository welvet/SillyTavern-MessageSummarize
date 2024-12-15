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
} from '../../../../script.js';
import { is_group_generating, selected_group } from '../../../group-chats.js';
import { loadMovingUIState } from '../../../power-user.js';
import { dragElement } from '../../../RossAscends-mods.js';
import { getTextTokens, getTokenCountAsync, tokenizers } from '../../../tokenizers.js';
import { debounce_timeout } from '../../../constants.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { MacrosParser } from '../../../macros.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
export { MODULE_NAME };

const MODULE_NAME = 'qvink_memory';
const MODULE_DIR = `scripts/extensions/third-party/${MODULE_NAME}`;

let lastCharacterId = null;
let lastGroupId = null;
let lastChatId = null;
let lastMessageHash = null;
let lastMessageId = null;
let inApiCall = false;

const defaultPrompt = `Summarize the given text in a single, very short and concise statement of fact.
State only events that will need to be remembered in the future.
Include names when possible.
Response must be in the past tense.
Maintain the same point of view as the text (i.e. if the text uses "you", use "your" in the response).
Your response must only contain the summary. If there is nothing worth summarizing, do not respond.`;
const defaultTemplate = '[Following are events that occurred in the past]:\n{{qvink_long_memory}}\n\n[Following are recent events]:\n{{qvink_short_memory}}';

const defaultSettings = {
    enabled: true,
    include_world_info: false,  // include world info in context when summarizing
    prompt: defaultPrompt,
    template: defaultTemplate,
    block_chat: false,  // block input when summarizing
    message_length_threshold: 10,  // minimum message token length for summarization
    summary_maximum_length: 20,  // maximum token length of the summary
    include_user_messages: false,  // include user messages in summarization
    include_names: false,  // include sender names in summary prompt

    long_term_context_limit: 0.1,  // percentage of context size to use as long-term memory limit
    short_term_context_limit: 0.1,  // percentage of context size to use as short-term memory limit

    // TODO implement context limits

    long_term_position: extension_prompt_types.IN_PROMPT,
    long_term_role: extension_prompt_roles.SYSTEM,
    long_term_depth: 2,
    long_term_scan: false,

    short_term_position: extension_prompt_types.IN_PROMPT,
    short_term_depth: 2,
    short_term_role: extension_prompt_roles.SYSTEM,
    short_term_scan: false,
};

// map of setting keys to their corresponding UI elements. Set by bind_setting()
const setting_bind_map = {}



// Utility functions
function log(message) {
    console.log("[Qvink Memory]", message);
}

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);

/**
 * Count the number of tokens in the provided text.
 * @param {string} text Text to count tokens for
 * @param {number} padding Number of additional tokens to add to the count
 * @returns {Promise<number>} Number of tokens in the text
 */
async function countSourceTokens(text, padding = 0) {
    return await getTokenCountAsync(text, padding);
}

async function get_context_size() {
    return getMaxContextSize(overrideLength);
}


// Event handling
async function onChatEvent() {
    // When the chat is updated, check if the summarization should be triggered
    log("Chat updated, checking if summarization should be triggered...")

    // if not enabled
    if (!extension_settings.qvink_memory.enabled) {
        return;
    }

    const context = getContext();
    const chat = context.chat;

    // no characters or group selected
    if (!context.groupId && context.characterId === undefined) {
        return;
    }

    // Streaming in-progress
    if (streamingProcessor && !streamingProcessor.isFinished) {
        return;
    }

    // Chat/character/group changed
    if ((context.groupId && lastGroupId !== context.groupId) || (context.characterId !== lastCharacterId) || (context.chatId !== lastChatId)) {
        log('Chat or character changed');
        refresh_memory_display();
        return;
    }

    // No new messages - do nothing
    if (chat.length === 0 || (lastMessageId === chat.length && getStringHash(chat[chat.length - 1].mes) === lastMessageHash)) {
        log("No new messages, skipping summarization")
        return;
    }

    // Message has been edited / regenerated
    if (chat.length
        && chat[chat.length - 1].extra?.memory
        && lastMessageId === chat.length
        && getStringHash(chat[chat.length - 1].mes) !== lastMessageHash) {
        log("Last message has been edite");
    }

    log("Chat update - summarize new memory here")
}


// Settings UI Events

/**
 * Bind a UI element to a setting.
 * @param id {string} ID of the UI element
 * @param key {string} Key of the setting
 * @param type {string} Type of the setting (number, boolean, etc)
 */
function bind_setting(selector, key, type=null) {
    let element = $(selector);
    setting_bind_map[key] = element

    // if no elements found, log error
    if (element.length === 0) {
        log(`Error: No element found for selector [${selector}] for setting [${key}]`);
        return;
    }

    // detect if it's a text area
    let trigger = 'change';

    // If a textarea, every keypress triggers an update
    if (element.is('textarea')) {
        trigger = 'input';
    }

    // detect if it's a radio button group
    let radio = false
    if (element.is('input[type="radio"]')) {
        trigger = 'change';
        radio = true;
    }

    // initialize the UI element with the setting value
    if (radio) {  // if a radio group, check the one that matches the setting value
        let selected = element.filter(`[value="${extension_settings.qvink_memory[key]}"]`)
        if (selected.length === 0) {
            log(`Error: No radio button found for value [${extension_settings.qvink_memory[key]}] for setting [${key}]`);
            return;
        }
        selected.prop('checked', true);
    } else {  // otherwise, set the value directly
        if (type === 'boolean') {
            element.prop('checked', extension_settings.qvink_memory[key]);
        } else {
            element.val(extension_settings.qvink_memory[key]);
        }
    }

    // Make the UI element update the setting when changed
    element.on(trigger, function (event) {
        let value;
        if (type === 'number') {
            value = Number($(this).val());
        } else if (type === 'boolean') {
            value = Boolean($(this).prop('checked'));
        } else {
            value = $(this).val();
        }

        extension_settings.qvink_memory[key] = value;
        saveSettingsDebounced();
        //log(`Setting [${key}] updated to [${value}]`);
    });
}
function bind_function(id, func) {
    $(id).on('click', function (event) {
        func(event);
    });
}

function refresh_memory_display() {
    // Refresh the memory display
    let value = generate_memory_prompt()
    $('#current_memory').val(value);
    $('#current_memory').scrollTop($('#current_memory')[0].scrollHeight);  // scroll to the bottom
}
function clear_memory_display(placeholdertext=null) {
    $('#current_memory').val(placeholdertext ?? '');
}

function on_restore_prompt_click() {
    $('#prompt').val(defaultPrompt).trigger('input');
}


// Memory functions
function store_memory(message, key, value) {
    // store information on the message object
    if (!message.extra) {
        message.extra = {};
    }
    if (!message.extra.qvink_memory) {
        message.extra.qvink_memory = {};
    }

    message.extra.qvink_memory[key] = value;
    saveChatDebounced();
}
function get_memory(message, key) {
    // get information from the message object
    return message.extra?.qvink_memory?.[key] ?? null;
}

function saveLastValues() {
    const context = getContext();
    lastGroupId = context.groupId;
    lastCharacterId = context.characterId;
    lastChatId = context.chatId;
    lastMessageId = context.chat?.length ?? null;
    lastMessageHash = getStringHash((context.chat.length && context.chat[context.chat.length - 1]['mes']) ?? '');
}

function generate_memory_prompt() {
    // Generate the memory prompt to inject into the main prompt
    let long_memory = get_long_memory();
    let short_memory = get_short_memory();

    let template = extension_settings.qvink_memory.template || defaultTemplate;
    return substituteParamsExtended(template, { qvink_long_memory: long_memory, qvink_short_memory: short_memory });
}

/**
 *  Summarize a text using the selected method.
 * @param text
 * @returns {Promise<string>|*|string}
 */
async function summarize_text(text) {
    // TODO: add world info as context here
    text = ` ${extension_settings.qvink_memory.prompt}\n\nText to Summarize:\n${text}`;

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
    return await generateRaw(text, '', false, false, '', extension_settings.qvink_memory.summary_maximum_length);
}


/**
 * Summarize a message and save the summary to the message's extra.
 * @param index {number|null} Index of the message to summarize (default last message)
 * @param replace {boolean} Whether to replace existing summaries (default false)
 */
async function summarize_message(index=null, replace=false) {
    let context = getContext();

    // Default to the last message, min 0
    index = Math.max(index ?? context.chat.length - 1, 0)

    // Check if the message already has a summary
    if (!replace && context.chat[index].extra?.qvink_memory) {
        log(`Message ${index} already has a summary, skipping summarization.`);
        return;
    }

    // Get the message
    let message = context.chat[index]

    // check if it's a user message
    if (!extension_settings.qvink_memory.include_user_messages && message.is_user) {
        log(`Message ${index} is a user message, skipping summarization.`);
        store_memory(message, 'memory', '');
        return
    }

    // Check if the message is too short to summarize
    let token_size = await countSourceTokens(message.mes);
    if (token_size < extension_settings.qvink_memory.message_length_threshold) {
        log(`Message ${index} is too short to summarize (${token_size} tokens), skipping summarization.`);
        store_memory(message, 'memory', '');
        return
    }

    // summarize it
    log(`Summarizing message ${index}...`)

    let text = message.mes;

    // Add the sender name to the prompt if enabled
    if (extension_settings.qvink_memory.include_names) {
        text = `[${message.name}]:\n${text}`;
    }

    let summary = await summarize_text(text)
    store_memory(message, 'memory', summary);
}


/**
 * Given an index range, concatenate the summaries and return the result.
 * @param start {number} Start index (default 0)
 * @param end {number|null} End index (default second-to-last message)
 * @param long_term {boolean} Whether to include only long-term memories (default false)
 * @param short_term {boolean} Whether to include only short-term memories (default false)
 */
function concatenate_summaries(start, end=null, long_term=false, short_term=false) {
    let context = getContext();

    // Default start is 0
    start = Math.max(start ?? 0, 0)

    // Default end is the second-to-last message
    end = Math.max(end ?? context.chat.length - 2, 0)

    // assert start is less than end
    if (start > end) {
        log('Cannot concatenate summaries: start index is greater than end index');
        return '';
    }

    // iterate through the chat in reverse order and collect the summaries
    let summaries = [];
    for (let i = end; i >= start; i--) {
        let message = context.chat[i];

        let long_term_flag = get_memory(message, 'long_term');
        let short_term_flag = get_memory(message, 'short_term')

        // skip if long_term is required and not present
        if (long_term && !long_term_flag) {
            continue;
        }

        // skip if short_term is required and not present
        if (short_term && !short_term_flag) {
            continue;
        }

        // concatenate the summary if it exists
        let memory = get_memory(message, 'memory');
        if (memory) {
            summaries.push(memory);
        }
    }

    // Reverse the summaries (since we iterated in reverse order)
    summaries.reverse();
    return summaries.join('\n\n');
}

/**
 * Check if the text is within the short-term memory size.
 * @param text
 * @returns {Promise<boolean>} Whether the text is within the short-term memory size
 */
async function text_within_short_limit(text) {
    // check if the text is within the short-term memory size
    let token_limit;
    if (extension_settings.qvink_memory.short_memory_context_limit) {  // if the context limit is enabled, set the token limit based on that
        let context_size = await getSourceContextSize();
        token_limit = context_size * extension_settings.qvink_memory.short_memory_context_limit;
    } else {
        token_limit = extension_settings.qvink_memory.short_memory_token_limit;  // otherwise, use the token limit
    }
    let token_size = await countSourceTokens(text);
    return token_size <= token_limit;
}

/**
 * Iterate through all chat messages and update whether each message should be included in short-term memory
 */
function update_short_term_memory() {
    log("Updating short-term memory flags...")
    let context = getContext();
    let chat = context.chat;

    // iterate through the chat in reverse order and mark the messages that should be included in short-term memory
    let limit_reached = false;
    let end = chat.length - 2;
    for (let i = end; i >= 0; i--) {
        let message = chat[i];
        if (limit_reached) {  // if the token limit was reached, mark all messages earlier than that as short-term
            store_memory(message, 'short_term', false);
            continue;
        }

        // check if we reached a token limit
        let short_memory_text = concatenate_summaries(i, end);
        if (!text_within_short_limit(short_memory_text)) {
            limit_reached = true;
        }

        // mark the message as short-term
        store_memory(message, 'short_term', true);
    }
}

/**
 * Set a message as a long term memory.
 * @param index
 */
function set_message_long_term(index=null) {
    let context = getContext();

    // Default to the second-to-last message, min 0
    index = Math.max(index ?? context.chat.length - 2, 0)

    // Mark long_term in the message's extra
    let message = context.chat[index]
    store_memory(message, 'long_term', true);
    log(`Set message ${index} as long term memory`);
}

function get_long_memory() {
    return concatenate_summaries(0, null, true, false);  // add up only the long-term memories
}

function get_short_memory() {
    update_short_term_memory()  // update the short-term memory markers
    return concatenate_summaries(0, null, false, true);  // add up only the short-term memories
}


/**
 * Perform summarization on the entire chat, optionally replacing existing summaries.
 * @param replace {boolean} Whether to replace existing summaries (default false)
 */
async function summarize_chat(replace=false) {
    log('Summarizing chat...')
    let context = getContext();

    // optionally block user from sending chat messages while summarization is in progress
    if (extension_settings.qvink_memory.block_chat) {
        deactivateSendButtons();
    }

    for (let i = 0; i < context.chat.length; i++) {
        await summarize_message(i, replace);
    }

    if (extension_settings.qvink_memory.block_chat) {
        activateSendButtons();
    }
    log('Chat summarized')
}


// UI handling
function loadSettings() {
    log("Loading Settings...")
    // Load default settings if not present
    extension_settings.qvink_memory = extension_settings.qvink_memory || defaultSettings;

    // If any individual setting is missing, add it with the default value
    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings.qvink_memory[key] === undefined) {
            extension_settings.qvink_memory[key] = defaultSettings[key];
        }
    }
}

function setupListeners() {
    log("Setting up listeners...")

    bind_function('#prompt_restore', on_restore_prompt_click);
    bind_function('#popout_button', (e) => {
        do_popout(e);
        e.stopPropagation();
    })
    bind_function('#rerun_memory', async (e) => {
        clear_memory_display("Loading...");  // clear the memory display
        await summarize_chat(true);  // rerun summarization, replacing existing summaries
        refresh_memory_display();  // refresh the memory display when finished
    })
    bind_function('#refresh_memory', (e) => {
        refresh_memory_display();  // refresh the memory display
    })

    bind_setting('#enabled', 'enabled', 'boolean');
    bind_setting('#include_world_info', 'include_world_info', 'boolean');
    bind_setting('#block_chat', 'block_chat', 'boolean');
    bind_setting('#prompt', 'prompt');
    bind_setting('#template', 'template');
    bind_setting('#include_user_messages', 'include_user_messages', 'boolean');
    bind_setting('#include_names', 'include_names', 'boolean');
    bind_setting('#message_length_threshold', 'message_length_threshold', 'number');
    bind_setting('#summary_maximum_length', 'summary_maximum_length', 'number');

    bind_setting('#long_term_context_limit', 'long_term_context_limit', 'number');
    bind_setting('#short_term_context_limit', 'short_term_context_limit', 'number');

    bind_setting('input[name="long_term_position"]', 'long_term_position');
    bind_setting('#long_term_depth', 'long_term_depth', 'number');
    bind_setting('#long_term_role', 'long_term_role');
    bind_setting('#long_term_scan', 'long_term_scan', 'boolean');

    bind_setting('input[name="short_term_position"]', 'short_term_position');
    bind_setting('#short_term_depth', 'short_term_depth', 'number');
    bind_setting('#short_term_role', 'short_term_role');
    bind_setting('#short_term_scan', 'short_term_scan', 'boolean');
}

function do_popout(e) {
    // popout the memory display
    const target = e.target;

    if ($('#qmExtensionPopout').length === 1) {  // Already open - close it
        log('saw existing popout, removing');
        $('#qmExtensionPopout').fadeOut(animation_duration, () => { $('#qmExtensionPopoutClose').trigger('click'); });
        return
    }

    // repurposes the zoomed avatar template to server as a floating div
    log('did not see popout yet, creating');
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
    loadSettings();
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
        loadSettings();
    });
}


jQuery(async function () {
    // entry point
    log("Loading Qvink Memory extension...")

    // Set up UI
    $("#extensions_settings2").append(await $.get(`${MODULE_DIR}/settings.html`));  // load html
    loadSettings();    // load settings
    setupListeners();  // setup UI listeners

    // Event listeners
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, onChatEvent);
    eventSource.on(event_types.MESSAGE_DELETED, onChatEvent);
    eventSource.on(event_types.MESSAGE_EDITED, onChatEvent);
    eventSource.on(event_types.MESSAGE_SWIPED, onChatEvent);
    eventSource.on(event_types.CHAT_CHANGED, onChatEvent);

    // Slash commands
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'remember',
        callback: (args) => {
            set_message_long_term(args.index);
        },
        helpString: 'Mark the latest chat message as a long-term memory',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                name: 'index',
                description: 'Index of the message to remember',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'initialize_memory',
        callback: (args) => {
            summarize_chat(args.replace);
        },
        helpString: 'Summarize all chat messages',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'replace',
                description: 'Replace existing summaries',
                isRequired: false,
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'log_chat',
        callback: (args) => {
            log("CHAT: ")
            log(getContext().chat)
        },
        helpString: 'log chat',
    }));

    // Macros
    MacrosParser.registerMacro('short_memory', () => get_short_memory());
    MacrosParser.registerMacro('long_memory', () => get_long_memory());
});
