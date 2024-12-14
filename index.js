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
import { countWebLlmTokens, generateWebLlmChatPrompt, getWebLlmContextSize, isWebLlmSupported } from '../../shared.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
export { MODULE_NAME };

const MODULE_NAME = 'qvink_memory';

let lastCharacterId = null;
let lastGroupId = null;
let lastChatId = null;
let lastMessageHash = null;
let lastMessageId = null;
let inApiCall = false;

function log(message) {
    console.log(`[Qvink Memory] ${message}`);
}

/**
 * Count the number of tokens in the provided text.
 * @param {string} text Text to count tokens for
 * @param {number} padding Number of additional tokens to add to the count
 * @returns {Promise<number>} Number of tokens in the text
 */
async function countSourceTokens(text, padding = 0) {
    if (extension_settings.qvink_memory.source === summary_sources.webllm) {
        const count = await countWebLlmTokens(text);
        return count + padding;
    }

    if (extension_settings.qvink_memory.source === summary_sources.extras) {
        const count = getTextTokens(tokenizers.GPT2, text).length;
        return count + padding;
    }

    return await getTokenCountAsync(text, padding);
}

async function get_context_size() {
    const overrideLength = extension_settings.qvink_memory.overrideResponseLength;

    if (extension_settings.qvink_memory.source === summary_sources.webllm) {
        const maxContext = await getWebLlmContextSize();
        return overrideLength > 0 ? (maxContext - overrideLength) : Math.round(maxContext * 0.75);
    }

    if (extension_settings.source === summary_sources.extras) {
        return 1024 - 64;
    }

    return getMaxContextSize(overrideLength);
}

const formatMemoryValue = function (value) {
    if (!value) {
        return '';
    }

    value = value.trim();

    if (extension_settings.qvink_memory.template) {
        return substituteParamsExtended(extension_settings.qvink_memory.template, { summary: value });
    } else {
        return `Event history: ${value}`;
    }
};

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);

const summary_sources = {
    'extras': 'extras',
    'main': 'main',
    'webllm': 'webllm',
};

const prompt_builders = {
    DEFAULT: 0,
    RAW_BLOCKING: 1,
    RAW_NON_BLOCKING: 2,
};

const defaultPrompt = 'Ignore previous instructions. Summarize the most important facts and events in the story so far. If a summary already exists in your memory, use that as a base and expand with new facts. Limit the summary to {{words}} words or less. Your response should include nothing but the summary.';
const defaultTemplate = '[Summary: {{summary}}]';

const defaultSettings = {
    memoryFrozen: false,
    SkipWIAN: false,
    source: summary_sources.extras,
    prompt: defaultPrompt,
    template: defaultTemplate,
    position: extension_prompt_types.IN_PROMPT,
    role: extension_prompt_roles.SYSTEM,
    scan: false,
    depth: 2,
    promptWords: 200,
    promptMinWords: 25,
    promptMaxWords: 1000,
    promptWordsStep: 25,
    promptInterval: 10,
    promptMinInterval: 0,
    promptMaxInterval: 250,
    promptIntervalStep: 1,
    promptForceWords: 0,
    promptForceWordsStep: 100,
    promptMinForceWords: 0,
    promptMaxForceWords: 10000,
    overrideResponseLength: 0,
    overrideResponseLengthMin: 0,
    overrideResponseLengthMax: 4096,
    overrideResponseLengthStep: 16,
    maxMessagesPerRequest: 0,
    maxMessagesPerRequestMin: 0,
    maxMessagesPerRequestMax: 250,
    maxMessagesPerRequestStep: 1,
    prompt_builder: prompt_builders.DEFAULT,
};


// UI handling
function loadSettings() {
    log("Loading Settings...")
    // Load default settings if not present
    if (Object.keys(extension_settings.qvink_memory).length === 0) {
        Object.assign(extension_settings.qvink_memory, defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings.qvink_memory[key] === undefined) {
            extension_settings.qvink_memory[key] = defaultSettings[key];
        }
    }

    // Load the current settings into the UI and trigger their change events
    $('#qm_source').val(extension_settings.qvink_memory.source).trigger('change');
    $('#qmemory_frozen').prop('checked', extension_settings.qvink_memory.memoryFrozen).trigger('input');
    $('#qmemory_skipWIAN').prop('checked', extension_settings.qvink_memory.SkipWIAN).trigger('input');
    $('#qmemory_prompt').val(extension_settings.qvink_memory.prompt).trigger('input');
    $('#qmemory_prompt_words').val(extension_settings.qvink_memory.promptWords).trigger('input');
    $('#qmemory_prompt_interval').val(extension_settings.qvink_memory.promptInterval).trigger('input');
    $('#qmemory_template').val(extension_settings.qvink_memory.template).trigger('input');
    $('#qmemory_depth').val(extension_settings.qvink_memory.depth).trigger('input');
    $('#qmemory_role').val(extension_settings.qvink_memory.role).trigger('input');
    $(`input[name="qmemory_position"][value="${extension_settings.qvink_memory.position}"]`).prop('checked', true).trigger('input');
    $('#qmemory_prompt_words_force').val(extension_settings.qvink_memory.promptForceWords).trigger('input');
    $(`input[name="qmemory_prompt_builder"][value="${extension_settings.qvink_memory.prompt_builder}"]`).prop('checked', true).trigger('input');
    $('#qmemory_override_response_length').val(extension_settings.qvink_memory.overrideResponseLength).trigger('input');
    $('#qmemory_max_messages_per_request').val(extension_settings.qvink_memory.maxMessagesPerRequest).trigger('input');
    $('#qmemory_include_wi_scan').prop('checked', extension_settings.qvink_memory.scan).trigger('input');
    switchSourceControls(extension_settings.qvink_memory.source);
}

function onSummarySourceChange(event) {
    // Update the source setting and switch the source-specific controls
    const value = event.target.value;
    extension_settings.qvink_memory.source = value;
    switchSourceControls(value);
    saveSettingsDebounced();
}

function switchSourceControls(value) {
    // Hide/show the source-specific settings
    $('#qmemory_settings [data-summary-source]').each((_, element) => {
        const source = element.dataset.summarySource.split(',').map(s => s.trim());
        $(element).toggle(source.includes(value));
    });
}



// Event handling
async function onChatEvent() {
    // When the chat is updated, check if the summarization should be triggered
    log("Chat updated, checking if summarization should be triggered...")
    
    // Module not enabled
    if (extension_settings.qvink_memory.source === summary_sources.extras && !modules.includes(MODULE_NAME)) {
        return;
    }

    // WebLLM used but not supported
    if (extension_settings.qvink_memory.source === summary_sources.webllm && !isWebLlmSupported()) {
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
        return;
    }

    // Currently summarizing or frozen state - skip
    if (inApiCall || extension_settings.qvink_memory.memoryFrozen) {
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
async function onPromptForceWordsAutoClick() {
    //
    const context = getContext();
    const maxPromptLength = await getSourceContextSize();
    const chat = context.chat;
    const allMessages = chat.filter(m => !m.is_system && m.mes).map(m => m.mes);
    const messagesWordCount = allMessages.map(m => extractAllWords(m)).flat().length;
    const averageMessageWordCount = messagesWordCount / allMessages.length;
    const tokensPerWord = await countSourceTokens(allMessages.join('\n')) / messagesWordCount;
    const wordsPerToken = 1 / tokensPerWord;
    const maxPromptLengthWords = Math.round(maxPromptLength * wordsPerToken);
    // How many words should pass so that messages will start be dropped out of context;
    const wordsPerPrompt = Math.floor(maxPromptLength / tokensPerWord);
    // How many words will be needed to fit the allowance buffer
    const summaryPromptWords = extractAllWords(extension_settings.qvink_memory.prompt).length;
    const promptAllowanceWords = maxPromptLengthWords - extension_settings.qvink_memory.promptWords - summaryPromptWords;
    const averageMessagesPerPrompt = Math.floor(promptAllowanceWords / averageMessageWordCount);
    const maxMessagesPerSummary = extension_settings.qvink_memory.maxMessagesPerRequest || 0;
    const targetMessagesInPrompt = maxMessagesPerSummary > 0 ? maxMessagesPerSummary : Math.max(0, averageMessagesPerPrompt);
    const targetSummaryWords = (targetMessagesInPrompt * averageMessageWordCount) + (promptAllowanceWords / 4);

    log({
        maxPromptLength,
        maxPromptLengthWords,
        promptAllowanceWords,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        targetSummaryWords,
        wordsPerPrompt,
        wordsPerToken,
        tokensPerWord,
        messagesWordCount,
    });

    const ROUNDING = 100;
    extension_settings.qvink_memory.promptForceWords = Math.max(1, Math.floor(targetSummaryWords / ROUNDING) * ROUNDING);
    $('#qmemory_prompt_words_force').val(extension_settings.qvink_memory.promptForceWords).trigger('input');
}

async function onPromptIntervalAutoClick() {
    const context = getContext();
    const maxPromptLength = await getSourceContextSize();
    const chat = context.chat;
    const allMessages = chat.filter(m => !m.is_system && m.mes).map(m => m.mes);
    const messagesWordCount = allMessages.map(m => extractAllWords(m)).flat().length;
    const messagesTokenCount = await countSourceTokens(allMessages.join('\n'));
    const tokensPerWord = messagesTokenCount / messagesWordCount;
    const averageMessageTokenCount = messagesTokenCount / allMessages.length;
    const targetSummaryTokens = Math.round(extension_settings.qvink_memory.promptWords * tokensPerWord);
    const promptTokens = await countSourceTokens(extension_settings.qvink_memory.prompt);
    const promptAllowance = maxPromptLength - promptTokens - targetSummaryTokens;
    const maxMessagesPerSummary = extension_settings.qvink_memory.maxMessagesPerRequest || 0;
    const averageMessagesPerPrompt = Math.floor(promptAllowance / averageMessageTokenCount);
    const targetMessagesInPrompt = maxMessagesPerSummary > 0 ? maxMessagesPerSummary : Math.max(0, averageMessagesPerPrompt);
    const adjustedAverageMessagesPerPrompt = targetMessagesInPrompt + (averageMessagesPerPrompt - targetMessagesInPrompt) / 4;

    log({
        maxPromptLength,
        promptAllowance,
        targetSummaryTokens,
        promptTokens,
        messagesWordCount,
        messagesTokenCount,
        tokensPerWord,
        averageMessageTokenCount,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        adjustedAverageMessagesPerPrompt,
        maxMessagesPerSummary,
    });

    const ROUNDING = 5;
    extension_settings.qvink_memory.promptInterval = Math.max(1, Math.floor(adjustedAverageMessagesPerPrompt / ROUNDING) * ROUNDING);

    $('#qmemory_prompt_interval').val(extension_settings.qvink_memory.promptInterval).trigger('input');
}

function onMemoryFrozenInput() {
    const value = Boolean($(this).prop('checked'));
    extension_settings.qvink_memory.memoryFrozen = value;
    saveSettingsDebounced();
}

function onMemorySkipWIANInput() {
    const value = Boolean($(this).prop('checked'));
    extension_settings.qvink_memory.SkipWIAN = value;
    saveSettingsDebounced();
}

function onMemoryPromptWordsInput() {
    const value = $(this).val();
    extension_settings.qvink_memory.promptWords = Number(value);
    $('#qmemory_prompt_words_value').text(extension_settings.qvink_memory.promptWords);
    saveSettingsDebounced();
}

function onMemoryPromptIntervalInput() {
    const value = $(this).val();
    extension_settings.qvink_memory.promptInterval = Number(value);
    $('#qmemory_prompt_interval_value').text(extension_settings.qvink_memory.promptInterval);
    saveSettingsDebounced();
}

function onMemoryPromptRestoreClick() {
    $('#qmemory_prompt').val(defaultPrompt).trigger('input');
}

function onMemoryPromptInput() {
    const value = $(this).val();
    extension_settings.qvink_memory.prompt = value;
    saveSettingsDebounced();
}

function onMemoryTemplateInput() {
    const value = $(this).val();
    extension_settings.qvink_memory.template = value;
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryDepthInput() {
    const value = $(this).val();
    extension_settings.qvink_memory.depth = Number(value);
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryRoleInput() {
    const value = $(this).val();
    extension_settings.qvink_memory.role = Number(value);
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryPositionChange(e) {
    const value = e.target.value;
    extension_settings.qvink_memory.position = value;
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryIncludeWIScanInput() {
    const value = !!$(this).prop('checked');
    extension_settings.qvink_memory.scan = value;
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryPromptWordsForceInput() {
    const value = $(this).val();
    extension_settings.qvink_memory.promptForceWords = Number(value);
    $('#qmemory_prompt_words_force_value').text(extension_settings.qvink_memory.promptForceWords);
    saveSettingsDebounced();
}

function onOverrideResponseLengthInput() {
    const value = $(this).val();
    extension_settings.qvink_memory.overrideResponseLength = Number(value);
    $('#qmemory_override_response_length_value').text(extension_settings.qvink_memory.overrideResponseLength);
    saveSettingsDebounced();
}

function onMaxMessagesPerRequestInput() {
    const value = $(this).val();
    extension_settings.qvink_memory.maxMessagesPerRequest = Number(value);
    $('#qmemory_max_messages_per_request_value').text(extension_settings.qvink_memory.maxMessagesPerRequest);
    saveSettingsDebounced();
}

function onMemoryRestoreClick() {
    // See what the current memory looks like
    log("Viewing current memory contents")
    let long_memory = get_long_memory()
    let short_memory = get_short_memory()
    let value = "Long-term memory:\n\n" + long_memory + '\n\n' + "Short-term memory:\n\n" + short_memory + '\n\n'
    $('#qmemory_contents').val(value);
}

function onMemoryContentInput() {
    const value = $(this).val();
    log("user inputting into memory (doing nothing): " + value)
}

function onMemoryPromptBuilderInput(e) {
    let value = Number(e.target.value);
    log("Prompt builder changed to: " + value)
    extension_settings.qvink_memory.prompt_builder = value;
    saveSettingsDebounced();
}


/**
 * Store information about the last character, chat, message, etc.
 */
function saveLastValues() {
    const context = getContext();
    lastGroupId = context.groupId;
    lastCharacterId = context.characterId;
    lastChatId = context.chatId;
    lastMessageId = context.chat?.length ?? null;
    lastMessageHash = getStringHash((context.chat.length && context.chat[context.chat.length - 1]['mes']) ?? '');
}


/**
 * Call the Extras API to summarize the provided text.
 * @param {string} text Text to summarize
 * @returns {Promise<string>} Summarized text
 */
async function callExtrasSummarizeAPI(text) {
    if (!modules.includes('summarize')) {
        throw new Error('Summarize module is not enabled in Extras API');
    }

    const url = new URL(getApiUrl());
    url.pathname = '/api/summarize';

    const apiResult = await doExtrasFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'bypass',
        },
        body: JSON.stringify({
            text: text,
            params: {},
        }),
    });

    if (apiResult.ok) {
        const data = await apiResult.json();
        const summary = data.summary;
        return summary;
    }

    throw new Error('Extras API call failed');
}


/**
 *  Summarize a text using the selected method.
 * @param text
 * @param method
 * @returns {Promise<string>|*|string}
 */
function summarize_text(text, method='main') {

    log(`Summarizing text using method: ${method}\n ${text}`)

    switch (method) {
        case 'main':
            return generateRaw(text, '', false, false, extension_settings.qvink_memory.prompt, extension_settings.qvink_memory.overrideResponseLength);
        case 'webllm':
            return generateWebLlmChatPrompt([{ role: 'system', content: extension_settings.qvink_memory.prompt }, { role: 'user', content: text }], { max_tokens: extension_settings.qvink_memory.overrideResponseLength });
        case 'extras':
            return callExtrasSummarizeAPI(text);
        default:
            return '';
    }

}


/**
 * Summarize a message and save the summary to the message's extra.
 * @param index {number|null} Index of the message to summarize (default last message)
 * @param replace {boolean} Whether to replace existing summaries (default false)
 */
function summarize_message(index=null, replace=false) {
    let context = getContext();

    // Default to the last message, min 0
    index = Math.max(index ?? context.chat.length - 1, 0)

    // Check if the message already has a summary
    if (!replace && context.chat[index].extra?.qvink_memory) {
        log(`Message ${index} already has a summary, skipping summarization.`);
        return;
    }

    // Get the message and summarize it
    let message = context.chat[index]
    let summary = summarize_text(message.mes)

    // Save the summary to the message's extra
    if (!message.extra) {
        message.extra = {};
    }
    message.extra.qvink_memory = summary;
    saveChatDebounced();

    log(`Summarized message ${index}: ${summary}`);
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

        let long_term_flag = message.extra?.qvink_long_term;
        let short_term_flag = message.extra?.qvink_short_term;

        // skip if long_term is required and not present
        if (long_term && !long_term_flag) {
            continue;
        }

        // skip if short_term is required and not present
        if (short_term && !short_term_flag) {
            continue;
        }

        // concatenate the summary if it exists
        if (message.extra?.qvink_memory) {
            summaries.push(message.extra.qvink_memory);
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
            message.extra.qvink_short_term = false;
            continue;
        }

        // check if we reached a token limit
        let short_memory_text = concatenate_summaries(i, end);
        if (!text_within_short_limit(short_memory_text)) {
            limit_reached = true;
        }

        // mark the message as short-term
        message.extra.qvink_short_term = true;
    }

    // TODO: does this need to happen at every message or just once at the end here?
    saveChatDebounced();
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
    if (!message.extra) {
        message.extra = {};
    }
    message.extra.qvink_long_term = true;
    saveChatDebounced();

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
 * Perform summarization on the entire chat, replacing existing summaries.
 * @param replace {boolean} Whether to replace existing summaries (default false)
 */
function summarize_chat(replace=false) {
    log('Summarizing chat...')
    let context = getContext();

    // optionally block user from sending chat messages while summarization is in progress
    let lock = extension_settings.qvink_memory.prompt_builder === prompt_builders.RAW_BLOCKING;
    if (lock) {
        deactivateSendButtons();
    }

    for (let i = 0; i < context.chat.length; i++) {
        summarize_message(i, replace);
    }

    if (lock) {
        activateSendButtons();
    }
}



function doPopout(e) {
    log('QM popout button clicked')
    const target = e.target;
    //repurposes the zoomed avatar template to server as a floating div
    if ($('#qmExtensionPopout').length === 0) {
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
        const prevSummaryBoxContents = $('#qmemory_contents').val(); //copy summary box before emptying
        originalElement.empty();
        originalElement.html('<div class="flex-container alignitemscenter justifyCenter wide100p"><small>Currently popped out</small></div>');
        newElement.append(controlBarHtml).append(originalHTMLClone);
        $('body').append(newElement);
        $('#qmExtensionDrawerContents').addClass('scrollableInnerFull');
        setMemoryContext(prevSummaryBoxContents, false); //paste prev summary box contents into popout box
        setupListeners();
        loadSettings();
        loadMovingUIState();

        $('#qmExtensionPopout').fadeIn(animation_duration);
        dragElement(newElement);

        //setup listener for close button to restore extensions menu
        $('#qmExtensionPopoutClose').off('click').on('click', function () {
            $('#qmExtensionDrawerContents').removeClass('scrollableInnerFull');
            const summaryPopoutHTML = $('#qmExtensionDrawerContents');
            $('#qmExtensionPopout').fadeOut(animation_duration, () => {
                originalElement.empty();
                originalElement.html(summaryPopoutHTML);
                $('#qmExtensionPopout').remove();
            });
            loadSettings();
        });
    } else {
        log('saw existing popout, removing');
        $('#qmExtensionPopout').fadeOut(animation_duration, () => { $('#qmExtensionPopoutClose').trigger('click'); });
    }
}

function setupListeners() {
    //setup shared listeners for popout and regular ext menu
    $('#qmemory_restore').off('click').on('click', onMemoryRestoreClick);
    $('#qmemory_contents').off('click').on('input', onMemoryContentInput);
    $('#qmemory_frozen').off('click').on('input', onMemoryFrozenInput);
    $('#qmemory_skipWIAN').off('click').on('input', onMemorySkipWIANInput);
    $('#qsummary_source').off('click').on('change', onSummarySourceChange);
    $('#qmemory_prompt_words').off('click').on('input', onMemoryPromptWordsInput);
    $('#qmemory_prompt_interval').off('click').on('input', onMemoryPromptIntervalInput);
    $('#qmemory_prompt').off('click').on('input', onMemoryPromptInput);
    $('#qmemory_force_summarize').off('click').on('click', () => forceSummarizeChat(false));
    $('#qmemory_template').off('click').on('input', onMemoryTemplateInput);
    $('#qmemory_depth').off('click').on('input', onMemoryDepthInput);
    $('#qmemory_role').off('click').on('input', onMemoryRoleInput);
    $('input[name="qmemory_position"]').off('click').on('change', onMemoryPositionChange);
    $('#qmemory_prompt_words_force').off('click').on('input', onMemoryPromptWordsForceInput);
    $('#qmemory_prompt_builder_default').off('click').on('input', onMemoryPromptBuilderInput);
    $('#qmemory_prompt_builder_raw_blocking').off('click').on('input', onMemoryPromptBuilderInput);
    $('#qmemory_prompt_builder_raw_non_blocking').off('click').on('input', onMemoryPromptBuilderInput);
    $('#qmemory_prompt_restore').off('click').on('click', onMemoryPromptRestoreClick);
    $('#qmemory_prompt_interval_auto').off('click').on('click', onPromptIntervalAutoClick);
    $('#qmemory_prompt_words_auto').off('click').on('click', onPromptForceWordsAutoClick);
    $('#qmemory_override_response_length').off('click').on('input', onOverrideResponseLengthInput);
    $('#qmemory_max_messages_per_request').off('click').on('input', onMaxMessagesPerRequestInput);
    $('#qmemory_include_wi_scan').off('input').on('input', onMemoryIncludeWIScanInput);
    $('#qmSettingsBlockToggle').off('click').on('click', function () {
        log('saw settings button click');
        $('#qmSettingsBlock').slideToggle(200, 'swing'); //toggleClass("hidden");
    });
}

async function addExtensionControls() {
    log("Adding extension controls...")
    const settingsHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'settings', { defaultSettings });
    log("Container: ", $(`#${MODULE_NAME}_container`))
    log("Settings HTML: ", settingsHtml)
    $(`#${MODULE_NAME}_container`).append(settingsHtml);

    //setupListeners();
    $('#qmExtensionPopoutButton').off('click').on('click', function (e) {
        doPopout(e);
        e.stopPropagation();
    });
}


jQuery(async function () {
    // entry point
    log("Loading Qvink Memory extension...")
    await addExtensionControls();
    loadSettings();

    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, onChatEvent);
    eventSource.on(event_types.MESSAGE_DELETED, onChatEvent);
    eventSource.on(event_types.MESSAGE_EDITED, onChatEvent);
    eventSource.on(event_types.MESSAGE_SWIPED, onChatEvent);
    eventSource.on(event_types.CHAT_CHANGED, onChatEvent);

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
            summarize_chat(true);
        },
        helpString: 'Summarize all chat messages',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'log',
        callback: (args) => {
            log("CHAT: ")
            log(getContext().chat)
        },
        helpString: 'log chat',
    }));

    // Macros for displaying the current state of the memory
    MacrosParser.registerMacro('qvink_short_memory', () => get_short_memory());
    MacrosParser.registerMacro('qvink_long_memory', () => get_long_memory());
});