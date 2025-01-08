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
    stopGeneration
} from '../../../../script.js';
import { formatInstructModeChat } from '../../../instruct-mode.js';
import { Popup } from '../../../popup.js';
import { is_group_generating, selected_group } from '../../../group-chats.js';
import { loadMovingUIState, renderStoryString, power_user } from '../../../power-user.js';
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
const css_remember_memory = `qvink_remember_memory`
const summary_div_class = `qvink_memory_text`  // class put on all added summary divs to identify them
const css_button_separator = `qvink_memory_button_separator`
const css_edit_textarea = `qvink_memory_edit_textarea`

// Macros for long-term and short-term memory injection
const long_memory_macro = `${MODULE_NAME}_long_memory`;
const short_memory_macro = `${MODULE_NAME}_short_memory`;

// Settings
const default_prompt = `You are a summarization assistant. Summarize the given fictional narrative in a single, very short and concise statement of fact.
Responses should be no more than {{words}} words.
Include names when possible.
Response must be in the past tense.
Your response must ONLY contain the summary.
Text to Summarize:
`
const default_long_template = `[Following is a list of events that occurred in the past]:\n{{${long_memory_macro}}}`
const default_short_template = `[Following is a list of recent events]:\n{{${short_memory_macro}}}`
const default_settings = {
    // inclusion criteria
    message_length_threshold: 10,  // minimum message token length for summarization
    include_user_messages: false,  // include user messages in summarization
    include_system_messages: false,  // include system messages in summarization
    include_thought_messages: false,  // include thought messages in summarization (Stepped Thinking extension)

    // summarization settings
    auto_summarize: true,   // whether to automatically summarize new chat messages
    summarization_delay: 0,  // delay auto-summarization by this many messages (0 summarizes immediately after sending, 1 waits for one message, etc)
    auto_summarize_on_edit: true,  // whether to automatically re-summarize edited chat messages
    auto_summarize_on_swipe: true,  // whether to automatically summarize new message swipes
    include_world_info: false,  // include world info in context when summarizing
    prompt: default_prompt,
    block_chat: true,  // block input when summarizing
    summary_maximum_length: 30,  // maximum token length of the summary
    include_last_user_message: false,  // include the last user message in the summarization prompt
    nest_messages_in_prompt: true,  // nest messages to summarize in the prompt for summarization

    // injection settings
    long_template: default_long_template,
    long_term_context_limit: 10,  // percentage of context size to use as long-term memory limit
    long_term_position: extension_prompt_types.IN_PROMPT,
    long_term_role: extension_prompt_roles.SYSTEM,
    long_term_depth: 2,
    long_term_scan: false,

    short_template: default_short_template,
    short_term_context_limit: 10,  // percentage of context size to use as short-term memory limit
    short_term_position: extension_prompt_types.IN_PROMPT,
    short_term_depth: 2,
    short_term_role: extension_prompt_roles.SYSTEM,
    short_term_scan: false,

    // misc
    debug_mode: false,  // enable debug mode
    stop_summarization: false,  // toggled to stop summarization, then toggled back to false.
    lorebook_entry: null,  // lorebook entry to dump memories to
    display_memories: true,  // display memories in the chat below each message
};
const global_settings = {
    profiles: {},  // dict of profiles by name
    character_profiles: {},  // dict of character IDs to profiles
    profile: 'Default', // Current profile
    chats_enabled: {}  // dict of chat IDs to whether memory is enabled
}
const settings_ui_map = {}  // map of settings to UI elements





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




// Settings Management
function initialize_settings() {
    if (extension_settings[MODULE_NAME] !== undefined) {  // setting already initialized
        log("Settings already initialized.")
        soft_reset_settings();
    } else {  // no settings present, first time initializing
        log("Extension settings not found. Initializing...")
        hard_reset_settings();
    }

    // load default profile
    load_profile();
}
function hard_reset_settings() {
    // Set the settings to the completely fresh values, deleting all profiles too
    if (global_settings['profiles']['Default'] === undefined) {  // if the default profile doesn't exist, create it
        global_settings['profiles']['Default'] = structuredClone(default_settings);
    }
    extension_settings[MODULE_NAME] = structuredClone({
        ...default_settings,
        ...global_settings
    });
}
function soft_reset_settings() {
    // fix any missing settings without destroying profiles
    extension_settings[MODULE_NAME] = Object.assign(
        structuredClone(default_settings),
        structuredClone(global_settings),
        extension_settings[MODULE_NAME]);

    // check for any missing profiles
    let profiles = get_settings('profiles');
    if (Object.keys(profiles).length === 0) {
        log("No profiles found, creating default profile.")
        profiles['Default'] = structuredClone(default_settings);
        set_settings('profiles', profiles);
    } else { // for each existing profile, add any missing default settings without overwriting existing settings
        for (let [profile, settings] of Object.entries(profiles)) {
            profiles[profile] = Object.assign(structuredClone(default_settings), settings);
        }
        set_settings('profiles', profiles);
    }
}
function reset_settings() {
    // reset the current settings to default
    Object.assign(extension_settings[MODULE_NAME], structuredClone(default_settings))
    refresh_settings();   // refresh the UI
}
function set_settings(key, value) {
    // Set a setting for the extension and save it
    extension_settings[MODULE_NAME][key] = value;
    saveSettingsDebounced();
}
function get_settings(key) {
    // Get a setting for the extension, or the default value if not set
    return extension_settings[MODULE_NAME]?.[key] ?? default_settings[key];
}
async function get_manifest() {
    return await fetch(`${MODULE_DIR}/manifest.json`).then(async response => {
        if (!response.ok) {
            error(`Error getting manifest.json: status: ${response.status}`);
            error(response)
        }
        return await response.json();
    })
}

function chat_enabled() {
    // check if the current chat is enabled
    let context = getContext();
    return get_settings('chats_enabled')?.[context.chatId] ?? true;
}
function toggle_chat_enabled(id=null) {
    let context = getContext();
    if (id === null) {
        id = context.chatId;
    }

    // Toggle whether to enable or disable memory for the current character
    let enabled = get_settings('chats_enabled')
    let current = enabled[id] ?? true;
    enabled[id] = !current;
    set_settings('chats_enabled', enabled);

    if (enabled[id]) {
        toastr.info(`Memory is now enabled for this chat`);
    } else {
        toastr.warning(`Memory is now disabled for this chat`);
    }
    refresh_memory()

    // update the message visuals
    for (let i=context.chat.length - 1 ; i >= 0; i--) {
        update_message_visuals(i);
    }
}

/**
 * Bind a UI element to a setting.
 * @param selector {string} jQuery Selector for the UI element
 * @param key {string} Key of the setting
 * @param type {string} Type of the setting (number, boolean)
 * @param callback {function} Callback function to run when the setting is updated
 */
function bind_setting(selector, key, type=null, callback=null) {
    // Bind a UI element to a setting, so if the UI element changes, the setting is updated
    let element = $(selector);
    settings_ui_map[key] = [element, type]

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

    // Set the UI element to the current setting value
    set_setting_ui_element(key, element, type);

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

        // trigger callback if provided, passing the new value
        if (callback !== null) {
            callback(value);
        }

        // update the save icon highlight
        update_save_icon_highlight();

        // refresh memory state (update message inclusion criteria, etc)
        if (trigger === 'change') {
            refresh_memory();
        } else if (trigger === 'input') {
            refresh_memory_debounced();  // debounce the refresh for input elements
        }
    });
}
function set_setting_ui_element(key, element, type) {
    // Set a UI element to the current setting value
    let radio = false;
    if (element.is('input[type="radio"]')) {
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
}
function update_save_icon_highlight() {
    // If the current settings are different than the current profile, highlight the save button
    if (detect_settings_difference()) {
        $('#save_profile').addClass('button_highlight');
    } else {
        $('#save_profile').removeClass('button_highlight');
    }
}
function refresh_settings() {
    // Refresh all settings UI elements according to the current settings
    debug("Refreshing settings...")

    // Set the UI profile dropdowns to reflect the available profiles
    let profile_options = Object.keys(get_settings('profiles'));
    let choose_profile_dropdown = $('#profile').empty();
    let character_profiles_dropdown = $('#character_profile').empty();
    for (let profile of profile_options) {
        choose_profile_dropdown.append(`<option value="${profile}">${profile}</option>`);
        character_profiles_dropdown.append(`<option value="${profile}">${profile}</option>`);
    }

    // iterate through the settings map and set each element to the current setting value
    for (let [key, [element, type]] of Object.entries(settings_ui_map)) {
        set_setting_ui_element(key, element, type);
    }

    // set the character profile dropdown to the current character's profile
    character_profiles_dropdown.val(get_character_profile());

    // update the save icon highlight
    update_save_icon_highlight();
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




// Profile management
function copy_settings(profile=null) {
    // copy the setting from the given profile (or current settings if none provided)
    let settings;

    if (!profile) {  // no profile given, copy current settings
        settings = structuredClone(extension_settings[MODULE_NAME]);
    } else {  // copy from the profile
        let profiles = get_settings('profiles');
        if (profiles[profile] === undefined) {  // profile doesn't exist, return empty
            return {}
        }

        // copy the settings from the profile
        settings = structuredClone(profiles[profile]);
    }

    // remove global settings from the copied settings
    for (let key of Object.keys(global_settings)) {
        delete settings[key];
    }
    return settings;
}
function detect_settings_difference(profile=null) {
    // check if the current settings differ from the given profile
    if (!profile) {  // if none provided, compare to the current profile
        profile = get_settings('profile')
    }
    let current_settings = copy_settings();
    let profile_settings = copy_settings(profile);

    let different = false;
    for (let key of Object.keys(profile_settings)) {
        if (profile_settings[key] !== current_settings[key]) {
            different = true;
            break;
        }
    }
    return different;
}
function save_profile(profile=null) {
    // Save the current settings to the given profile
    if (!profile) {  // if none provided, save to the current profile
        profile = get_settings('profile');
    }
    log("Saving Configuration Profile: "+profile);

    // save the current settings to the profile
    let profiles = get_settings('profiles');
    profiles[profile] = copy_settings();
    set_settings('profiles', profiles);

    // update the button highlight
    update_save_icon_highlight();
}
function load_profile(profile=null) {
    // load a given settings profile
    if (!profile) {  // if none provided, reload the current profile
        profile = get_settings('profile');
    }

    let settings = copy_settings(profile);  // copy the settings from the profile
    if (!settings) {
        error("Profile not found: "+profile);
        return;
    }

    log("Loading Configuration Profile: "+profile);
    Object.assign(extension_settings[MODULE_NAME], settings);  // update the settings
    set_settings('profile', profile);  // set the current profile
    refresh_settings();
}
async function rename_profile() {
    // Rename the current profile via user input
    let old_name = get_settings('profile');
    let new_name = await Popup.show.input("Rename Configuration Profile", `Enter a new name:`, old_name);

    // if it's the same name or none provided, do nothing
    if (!new_name || old_name === new_name) {
        return;
    }

    let profiles = get_settings('profiles');

    // check if the new name already exists
    if (profiles[new_name]) {
        error(`Profile [${new_name}] already exists`);
        return;
    }

    // rename the profile
    profiles[new_name] = profiles[old_name];
    delete profiles[old_name];
    set_settings('profiles', profiles);
    set_settings('profile', new_name);  // set the current profile to the new name

    // if any characters are using the old profile, update it to the new name
    let character_profiles = get_settings('character_profiles');
    for (let [characterId, character_profile] of Object.entries(character_profiles)) {
        if (character_profile === old_name) {
            character_profiles[characterId] = new_name;
        }
    }

    log(`Renamed profile [${old_name}] to [${new_name}]`);
    refresh_settings()
}
function new_profile() {
    // create a new profile
    let profiles = get_settings('profiles');
    let profile = 'New Profile';
    let i = 1;
    while (profiles[profile]) {
        profile = `New Profile ${i}`;
        i++;
    }
    save_profile(profile);
    load_profile(profile);
}
function delete_profile() {
    // Delete the current profile
    if (get_settings('profiles').length === 1) {
        error("Cannot delete your last profile");
        return;
    }
    let profile = get_settings('profile');
    let profiles = get_settings('profiles');
    log(`Deleting Configuration Profile: ${profile}`);
    delete profiles[profile];
    set_settings('profiles', profiles);
    load_profile('Default');
}
function set_character_profile(profile) {
    // Make the current profile the default for the current character
    let context = getContext();
    let characterId = context.characterId;
    if (!characterId) {  // no character selected
        return;
    }

    let character_profiles = get_settings('character_profiles');
    character_profiles[characterId] = profile;
    log(`Set character [${characterId}] to use profile [${profile}]`);
    set_settings('character_profiles', character_profiles);
}
function get_character_profile(characterId) {
    // Get the profile for a given character
    if (!characterId) {  // if none given, assume the current character
        characterId = getContext().characterId;
    }
    let character_profiles = get_settings('character_profiles');
    return character_profiles[characterId] ?? 'Default';
}
function load_character_profile() {
    // Load the settings profile for the current character
    let profile = get_character_profile();
    load_profile(profile);
}





// UI functions
function set_memory_display(text='') {
    let display = $('#memory_display');
    display.val(text);
    display.scrollTop(display[0].scrollHeight);
}
function on_restore_prompt_click() {
    $('#prompt').val(default_prompt).trigger('input');
}
function get_message_div(index) {
    // given a message index, get the div element for that message
    let div = $(`div[mesid="${index}"]`);
    if (div.length === 0) {
        return null;
    }
    return div;
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
    let div_element = get_message_div(i);

    // div not found (message may not be loaded)
    if (!div_element) {
        return;
    }

    // remove any existing added divs
    div_element.find(`div.${summary_div_class}`).remove();

    // If setting isn't enabled, don't display memories
    if (!get_settings('display_memories') || !chat_enabled()) {
        return;
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

    // create the div element for the memory and add it to the message div
    let memory_div = $(`<div class="${summary_div_class} ${css_message_div} ${style_class}">${text}</div>`)
    message_element.after(memory_div);

    // add a click event to the memory div to edit the memory
    memory_div.on('click', function () {
        edit_memory(i);
    })
}
function scroll_to_bottom_of_chat() {
    // Scroll to the bottom of the chat
    let chat = $('#chat');
    chat.scrollTop(chat[0].scrollHeight);
}
function edit_memory(index) {
    // Allow the user to edit a message summary
    let message = getContext().chat[index];
    let message_div = get_message_div(index);

    // get the current memory text
    let memory = get_memory(message, 'memory')?.trim() ?? '';

    // find the div holding the memory text
    let memory_div = message_div.find(`div.${summary_div_class}`);

    // Hide the memory div and add the textarea
    let textarea = $(`<textarea class="${css_message_div} ${css_edit_textarea}" rows="1"></textarea>`);
    memory_div.hide();
    memory_div.after(textarea);
    textarea.focus();  // focus on the textarea
    textarea.val(memory);  // set the textarea value to the memory text (this is done after focus to keep the cursor at the end)
    textarea.height(textarea[0].scrollHeight-10);  // set the height of the textarea to fit the text

    function confirm_edit() {
        let new_memory = textarea.val();
        store_memory(message, 'memory', new_memory);
        textarea.remove();  // remove the textarea
        memory_div.show();  // show the memory div
        refresh_memory();
        debug(`Edited memory for message ${index}`);
    }

    function cancel_edit() {
        textarea.remove();  // remove the textarea
        memory_div.show();  // show the memory div
    }

    // save when the textarea loses focus, or when enter is pressed
    textarea.on('blur', confirm_edit);
    textarea.on('keydown', function (event) {
        if (event.key === 'Enter') {  // confirm edit
            event.preventDefault();
            confirm_edit();
        } else if (event.key === 'Escape') {  // cancel edit
            event.preventDefault();
            cancel_edit();
        }
    })
}
function initialize_message_buttons() {
    // Add the message buttons to the chat messages

    let remember_button_class = `${MODULE_NAME}_remember_button`
    let summarize_button_class = `${MODULE_NAME}_summarize_button`
    let edit_button_class = `${MODULE_NAME}_edit_button`

    let html = `
<div title="Remember (toggle)" class="mes_button ${remember_button_class} fa-solid fa-brain" tabindex="0"></div>
<div title="Summarize (AI)" class="mes_button ${summarize_button_class} fa-solid fa-quote-left" tabindex="0"></div>
<div title="Edit Summary" class="mes_button ${edit_button_class} fa-solid fa-pen-fancy" tabindex="0"></div>
<span class="${css_button_separator}"></span>
`

    $("#message_template .mes_buttons .extraMesButtons").prepend(html);

    // button events
    $(document).on("click", `.${remember_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        remember_message_toggle(message_id);
    });
    $(document).on("click", `.${summarize_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await summarize_message(message_id, true);  // summarize the message, replacing the existing summary
        refresh_memory();
    });
    $(document).on("click", `.${edit_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await edit_memory(message_id);
    });

    // when a message is hidden/unhidden, trigger a memory refresh
    $(document).on("click", ".mes_hide", refresh_memory);
    $(document).on("click", ".mes_unhide", refresh_memory);


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

    // Also save on the current swipe info if present
    let swipe_index = message.swipe_id
    if (swipe_index) {
        message.swipe_info[swipe_index].extra[MODULE_NAME] = message.extra[MODULE_NAME];
    }

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
        await summarize_message(index, false);
    }
    refresh_memory();
}


// Inclusion / Exclusion criteria
function check_message_exclusion(message) {
    // check for any exclusion criteria for a given message
    // (this does NOT take context lengths into account, only exclusion criteria based on the message itself).

    // first check if it has been marked to be remembered by the user - if so, it bypasses all exclusion criteria
    if (get_memory(message, 'remember')) {
        return true;
    }

    // check if it's a user message and exclude if the setting is disabled
    if (!get_settings('include_user_messages') && message.is_user) {
        return false
    }

    // check if it's a thought message and exclude if the setting is disabled (Stepped Thinking extension)
    if (!get_settings('include_thought_messages') && message.is_thoughts) {
        return false
    }

    // check if it's a system (hidden) message and exclude if the setting is disabled
    if (!get_settings('include_system_messages') && message.is_system) {
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
        if (!summary) {  // if there's no summary, skip it
            continue;
        }
        summaries.push(summary)
    }

    // Add an asterisk to the beginning of each summary and join them with newlines
    summaries = summaries.map((s) => `* ${s}`);
    return summaries.join('\n');
}
function get_long_memory() {
    // get the injection text for long-term memory
    return concatenate_summaries(null, null, "long");
}
function get_short_memory() {
    // get the injection text for short-term memory
    return concatenate_summaries(null, null, "short");
}



// Summarization
async function summarize_text(text) {
    let prompt = get_settings('prompt');
    prompt = substituteParamsExtended(prompt);  // substitute any macro parameters in the prompt

    let ignore_instruct_template = false;

    if (get_settings('nest_messages_in_prompt')) {
        // Add the text to the prompt
        text = `${prompt}\n${text}`

        // then wrap it in the system prompt
        text = formatInstructModeChat("", text, false, true, "", "", "", null)
    } else {
        // wrap the main prompt only as a system message
        prompt = formatInstructModeChat("", prompt, false, true, "", "", "", null)

        // then add the text after it
        text = `${prompt}\n${text}`
    }

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
        return await generateQuietPrompt(text, false, false, '', "assistant", get_settings('summary_maximum_length'));
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

        // append the assistant starting message template to the text, replacing the name with "assistant" if needed
        let output_sequence = substituteParamsExtended(power_user.instruct.output_sequence, {name: "assistant"});
        text = `${text}\n${output_sequence}`

        return await generateRaw(text, '', true, false, '', get_settings('summary_maximum_length'));
    }
}

/**
 * Summarize a message and save the summary to the message object.
 * @param index {number|null} Index of the message to summarize (default last message)
 * @param replace {boolean} Whether to replace existing summaries (default false)
 */
async function summarize_message(index=null, replace=false) {
    let context = getContext();
    let chat = context.chat;

    // Default to the last message, min 0
    index = Math.max(index ?? chat.length - 1, 0)
    let message = chat[index]
    let message_hash = getStringHash(message.mes);

    // If we aren't forcing replacement, skip if the message already has a summary
    let memory = get_memory(message, 'memory');
    if (!replace && memory) {
        return;
    }

    // Temporarily update the message summary text to indicate that it's being summarized (no styling based on inclusion criteria)
    // A full visual update with style should be done on the whole chat after inclusion criteria have been recalculated
    update_message_visuals(index, false, "Summarizing...")

    let messages_to_include = []

    // Add the last user message to the prompt if enabled
    if (get_settings('include_last_user_message')) {
        let last_message = chat[index-1]
        if (last_message && last_message.is_user) {
            messages_to_include.push(last_message)
        }
    }

    messages_to_include.push(message)

    // Create the text to summarize
    let texts = []
    for (let m of messages_to_include) {
        /**
         * [FROM ST REPO]
         * Formats instruct mode chat message.
         * @param {string} name Character name.
         * @param {string} mes Message text.
         * @param {boolean} isUser Is the message from the user.
         * @param {boolean} isNarrator Is the message from the narrator.
         * @param {string} forceAvatar Force avatar string.
         * @param {string} name1 User name.
         * @param {string} name2 Character name.
         * @param {boolean|number} forceOutputSequence Force to use first/last output sequence (if configured).
         * @returns {string} Formatted instruct mode chat message.
         */
        let ctx = getContext()
        let text = formatInstructModeChat(m.name, m.mes, m.is_user, false, "", ctx.name1, ctx.name2, null)
        texts.push(text)
    }

    // join the messages with newlines
    let text = texts.join('\n\n')

    // summarize it
    debug(`Summarizing message ${index}...`)

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

function refresh_memory() {
    if (!chat_enabled()) { // if chat not enabled, remove the injections
        setExtensionPrompt(`${MODULE_NAME}_long`, "");
        setExtensionPrompt(`${MODULE_NAME}_short`, "");
        set_memory_display("Memory is disabled for this chat. Use /toggle_memory to enable.")  // update the memory display
        return;
    }

    // Update the UI according to the current state of the chat memories, and update the injection prompts accordingly
    update_message_inclusion_flags()  // update the inclusion flags for all messages
    let long_memory = get_long_memory();
    let short_memory = get_short_memory();

    let long_template = get_settings('long_template')
    let short_template = get_settings('short_template')

    let long_injection = substituteParamsExtended(long_template, {[long_memory_macro]: long_memory});
    let short_injection = substituteParamsExtended(short_template, {[short_memory_macro]: short_memory});

    // inject the memories into the templates, if they exist
    if (long_memory) {
        setExtensionPrompt(`${MODULE_NAME}_long`,  long_injection,  get_settings('long_term_position'), get_settings('long_term_depth'), get_settings('long_term_scan'), get_settings('long_term_role'));
    }

    if (short_memory) {
        setExtensionPrompt(`${MODULE_NAME}_short`, short_injection, get_settings('short_term_position'), get_settings('short_term_depth'), get_settings('short_term_scan'), get_settings('short_term_role'));
    }

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

    // iterate through the chat in reverse order and summarize each message
    let messages_to_delay = get_settings('summarization_delay');  // number of messages to delay summarization for
    for (let i = context.chat.length-1; i >= 0; i--) {
        if (get_settings('stop_summarization')) {  // check if summarization should be stopped
            log('Summarization stopped');
            break;
        }

        // get current message
        let message = context.chat[i];

        // check message exclusion criteria
        let include = check_message_exclusion(message);  // check if the message should be included due to the inclusion criteria (not context limits)
        if (!include) {
            continue;
        }

        // If the message is not yet ready to be summarized, skip it and decrement the delay counter
        if (messages_to_delay > 0) {
            messages_to_delay--;
            continue;
        }

        update_message_inclusion_flags()  // NOW update message inclusion based on context lengths
        if (get_memory(message, 'include') === null) {   // excluded due to context limits?
            // If the message is not included in memory due to the context limits, stop summarizing the rest of the chat.
            debug(`Message ${i} is not included in memory, stopping summarization.`)
            break
        }


        // summarize the message
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
var last_message_swiped = false;  // flag for whether the last message was swiped
async function on_chat_event(event=null, id=null) {
    // When the chat is updated, check if the summarization should be triggered
    debug("Chat updated: " + event + " ID: " + id)

    const context = getContext();

    switch (event) {
        case 'chat_changed':  // chat was changed
            load_character_profile();  // load the profile for the current character
            refresh_memory();  // refresh the memory state
            if (context?.chat?.length) {
                scroll_to_bottom_of_chat();  // scroll to the bottom of the chat (area is added due to memories)
            }
            break;

        case 'message_deleted':   // message was deleted
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message deleted, refreshing memory")
            refresh_memory();
            last_message_swiped = false;
            break;

        case 'message_sent':  // user sent a message
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("user message")
            break;

        case 'new_message':  // New message detected
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!context.groupId && context.characterId === undefined) break; // no characters or group selected
            if (streamingProcessor && !streamingProcessor.isFinished) break;  // Streaming in-progress

            if (last_message_swiped) {  // this is a swipe
                if (!get_settings('auto_summarize_on_swipe')) break;  // if auto-summarize on swipe is disabled, do nothing
                debug("Summarizing on swipe")
                await summarize_message(id, true);  // summarize that message, replacing existing summary
                refresh_memory()
                break;
            } else { // not a swipe
                if (!get_settings('auto_summarize')) break;  // if regular auto-summarize is disabled, do nothing
                debug("New message detected, summarizing")
                await summarize_chat(false);  // summarize the chat, but don't replace existing summaries
                break;
            }


        case 'message_edited':  // Message has been edited
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize_on_edit')) break;  // if auto-summarize on edit is disabled, skip
            debug("Message edited, summarizing")
            summarize_message(i, true);  // summarize that message, replacing existing summary
            break;

        case 'message_swiped':  // when this event occurs, don't do anything (a new_message event will follow)
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message swiped, reloading memory")
            refresh_memory()
            last_message_swiped = true;
            break;

        case 'message_received':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            break;

        default:
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug(`Unknown event: "${event}", refreshing memory`)
            refresh_memory();
    }

    // reset the swipe flag if the event is not a message_swiped event
    if (event !== 'message_swiped') {
        last_message_swiped = false;
    }

}

// todo: temporary hack to fix the popout
var popout_button_bound = false;

// UI handling
function setupListeners() {
    debug("Setting up listeners...")

    // Trigger profile changes
    bind_function('#save_profile', () => save_profile());
    bind_function('#restore_profile', () => load_profile());
    bind_function('#rename_profile', () => rename_profile())
    bind_function('#new_profile', new_profile);
    bind_function('#delete_profile', delete_profile);
    bind_function('#character_profile', (e) => {
        let profile = $(e.target).val();
        set_character_profile(profile);
    });

    bind_function('#prompt_restore', on_restore_prompt_click);
    bind_function('#rerun_memory', async (e) => {
        set_memory_display("Summarizing...");  // clear the memory display
        await summarize_chat(true);  // rerun summarization, replacing existing summaries
        refresh_memory();  // refresh the memory (and the display) when finished
    })
    bind_function('#refresh_memory', refresh_memory);
    bind_function('#stop_summarization', stop_summarization);
    bind_function('#revert_settings', reset_settings);

    if (!popout_button_bound) {
        popout_button_bound = true;
        bind_function('#popout_button', (e) => {
            do_popout(e);
            e.stopPropagation();
        })
    }

    // todo
    //bind_function('#dump_to_lorebook', dump_memories_to_lorebook);
    //bind_setting('#lorebook_entry', 'lorebook_entry')

    bind_setting('#profile', 'profile', 'text', load_profile);

    bind_setting('#auto_summarize', 'auto_summarize', 'boolean', (val) => {
        // when disabled, summarize_before_generation and summarization_delay get disabled
        $('#summarization_delay').prop('disabled', !val);
        $('#summarize_before_generation').prop('disabled', !val);
    });
    bind_setting('#auto_summarize_on_edit', 'auto_summarize_on_edit', 'boolean');
    bind_setting('#auto_summarize_on_swipe', 'auto_summarize_on_swipe', 'boolean');
    bind_setting('#summarization_delay', 'summarization_delay', 'number');
    bind_setting('#include_world_info', 'include_world_info', 'boolean');
    bind_setting('#block_chat', 'block_chat', 'boolean');
    bind_setting('#prompt', 'prompt');
    bind_setting('#include_user_messages', 'include_user_messages', 'boolean');
    bind_setting('#include_system_messages', 'include_system_messages', 'boolean');
    bind_setting('#include_thought_messages', 'include_thought_messages', 'boolean');

    bind_setting('#message_length_threshold', 'message_length_threshold', 'number');
    bind_setting('#summary_maximum_length', 'summary_maximum_length', 'number');
    bind_setting('#debug_mode', 'debug_mode', 'boolean');
    bind_setting('#display_memories', 'display_memories', 'boolean')
    bind_setting('#include_last_user_message', 'include_last_user_message', 'boolean')
    bind_setting('#nest_messages_in_prompt', 'nest_messages_in_prompt', 'boolean')

    bind_setting('#short_template', 'short_template');
    bind_setting('input[name="short_term_position"]', 'short_term_position', 'number');
    bind_setting('#short_term_depth', 'short_term_depth', 'number');
    bind_setting('#short_term_role', 'short_term_role');
    bind_setting('#short_term_scan', 'short_term_scan', 'boolean');
    bind_setting('#short_term_context_limit', 'short_term_context_limit', 'number', () => {
        $('#short_term_context_limit_display').text(get_short_token_limit());
    });

    bind_setting('#long_template', 'long_template');
    bind_setting('input[name="long_term_position"]', 'long_term_position', 'number');
    bind_setting('#long_term_depth', 'long_term_depth', 'number');
    bind_setting('#long_term_role', 'long_term_role');
    bind_setting('#long_term_scan', 'long_term_scan', 'boolean');
    bind_setting('#long_term_context_limit', 'long_term_context_limit', 'number', () => {
        $('#long_term_context_limit_display').text(get_long_token_limit());  // update the displayed token limit
    });


    // trigger the change event once to update the display at start
    $('#long_term_context_limit').trigger('change');
    $('#short_term_context_limit').trigger('change');

    refresh_settings()
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

    // Read version from manifest.json
    const manifest = await get_manifest();
    const VERSION = manifest.version;
    log(`Version: ${VERSION}`)

    // Load settings
    initialize_settings();

    // Set up settings UI
    $("#extensions_settings2").append(await $.get(`${MODULE_DIR}/settings.html`));  // load html
    $("h4").append(`<span class="version_id">v${VERSION}</span>`)   // add version number to each header

    // setup UI listeners
    setupListeners();

    // message buttons
    initialize_message_buttons();

    // Event listeners
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (id) => on_chat_event('new_message', id));
    eventSource.on(event_types.MESSAGE_SENT, (id) => on_chat_event('message_sent', id));
    eventSource.on(event_types.MESSAGE_RECEIVED, (id) => on_chat_event('message_received', id));
    eventSource.on(event_types.MESSAGE_DELETED, (id) => on_chat_event('message_deleted', id));
    eventSource.on(event_types.MESSAGE_EDITED, (id) => on_chat_event('message_edited', id));
    eventSource.on(event_types.MESSAGE_SWIPED, (id) => on_chat_event('message_swiped', id));
    eventSource.on(event_types.CHAT_CHANGED, () => on_chat_event('chat_changed'));

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

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'hard_reset',
        callback: (args) => {
            hard_reset_settings()
            refresh_settings()
            refresh_memory()
        },
        helpString: 'Hard reset all setttings',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'log_settings',
        callback: (args) => {
            log("SETTINGS: ")
            log(extension_settings[MODULE_NAME])
            log(getContext())
        },
        helpString: 'Log current settings',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory',
        callback: (args) => {
            toggle_chat_enabled();  // toggle the memory for the current chat
        },
        helpString: 'Toggle memory for the current chat.',
    }));




    // Macros
    MacrosParser.registerMacro(short_memory_macro, () => get_short_memory());
    MacrosParser.registerMacro(long_memory_macro, () => get_long_memory());
    MacrosParser.registerMacro("words", () => get_settings('summary_maximum_length'));
});
