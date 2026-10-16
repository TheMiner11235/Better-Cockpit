/*
 * Copyright (C) 2021 Red Hat, Inc.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */
import cockpit from "cockpit";
import { journal } from "journal";

const _ = cockpit.gettext;

export const timeFilterOptions = [
    { key: 1, value: { key: "boot", value: 0 }, content: _("Current boot") },
    { key: 2, value: { key: "boot", value: "-1" }, content: _("Previous boot") },
    { key: 3, value: { key: "since", value: "-24hours", default: true }, content: _("Last 24 hours") },
    { key: 4, value: { key: "since", value: "-7days" }, content: _("Last 7 days") },
];

// Return the { key, value } of the time filter preset that corresponds
// to the given location options.  When neither "boot" nor "since" is set,
// fall back to the default preset ("Last 24 hours").
export const getTimeFilterOption = (options) => {
    function find_key(key, value) {
        return timeFilterOptions.find(o => o.value.key == key && o.value.value == value)?.value;
    }
    if (options.boot)
        return find_key('boot', options.boot);
    else if (options.since)
        return find_key('since', options.since);
    return timeFilterOptions.find(option => 'default' in option.value)?.value; // Use the default key
};

// Sometimes `journalctl` can be compiled without `PCRE2` which means
// that `--grep` is not usable. Hide the search box in such cases.
export function checkJournalctlGrep(setShowTextSearch) {
    cockpit.spawn(["journalctl", "--version"])
            .then(m => {
                if (m.indexOf("-PCRE2") !== -1) {
                    setShowTextSearch(false);
                } else {
                    setShowTextSearch(true);
                }
            });
}

// Build the journalctl query for the inline help popover
export const getFilteredQuery = ({ match, options }) => {
    const cmd = journal.build_cmd(match, options);
    const filtered_cmd = cmd.filter(i => i !== "-q" && i !== "--output=json");
    if (filtered_cmd[filtered_cmd.length - 1] == "--")
        filtered_cmd.pop();

    return filtered_cmd.join(" ");
};

export const getGrepFiltersFromOptions = ({ options }) => {
    const grep = options.grep || "";
    let full_grep = "";
    const match = [];

    // `prio` is a legacy name. Accept it, but don't generate it
    const prio_level = options.priority || options.prio || "err";
    full_grep += "priority:" + prio_level + " ";

    if (options.service) {
        options.service.split(",").forEach(s => {
            if (!s.endsWith(".service"))
                s = s + ".service";
            match.push('_SYSTEMD_UNIT=' + s, "+", "COREDUMP_UNIT=" + s, "+", "UNIT=" + s);
        });
        full_grep += "service:" + options.service + " ";
    } else if (options["user-service"]) {
        options["user-service"].split(",").forEach(s => {
            if (!s.endsWith(".service"))
                s = s + ".service";
            match.push('_SYSTEMD_USER_UNIT=' + s, "+", "COREDUMP_USER_UNIT=" + s, "+", "USER_UNIT=" + s);
        });
        full_grep += "user-service:" + options["user-service"] + " ";
    }

    if (options.tag && options.tag !== "*") {
        match.push('SYSLOG_IDENTIFIER=' + options.tag);
        full_grep += "identifier:" + options.tag + " ";
    }

    if (options.boot)
        full_grep += "boot:" + options.boot + " ";

    if (options.since)
        full_grep += "since:" + options.since.replaceAll(" ", "\\ ") + " ";

    if (options.until)
        full_grep += "until:" + options.until.replaceAll(" ", "\\ ") + " ";

    // Other filters may be passed as well
    Object.keys(options).forEach(k => {
        if (k === k.toUpperCase() && options[k]) {
            options[k].split(",").forEach(v => match.push(k + "=" + v));
            full_grep += k + '=' + options[k] + " ";
        }
    });

    full_grep += grep;

    return [full_grep, match];
};

const split_search = (text) => {
    let last_i = 0;
    const words = [];

    // Add space so the following loop can always pick group on space (without trailing
    // space the last group would not be recognized and it would need a special check)
    if (text.length && text[text.length - 1] !== " ")
        text += " ";

    for (let i = 1; i < text.length; i++) {
        if (text[i] === " " && text[i - 1] !== "\\") {
            words.push(text.substring(last_i, i).replaceAll("\\ ", " "));
            last_i = i + 1;
        }
    }
    return words;
};

export const getOptionsFromTextInput = (value) => {
    const new_items = {};
    const values = split_search(value)
            .filter(item => {
                let s = item.split("=");
                if (s.length === 2 && s[0] === s[0].toUpperCase()) {
                    new_items[s[0]] = s[1];
                    return false;
                }

                const well_know_keys = ["since", "until", "boot", "priority", "follow", "service", "unit", "identifier"];
                const map_keys = (key) => {
                    if (key === "identifier")
                        return "tag";
                    // "unit" is the user facing filter name (see the "Unit"
                    // popover in logs.jsx), while the internal/URL option is
                    // called "service"; accept both spellings.
                    if (key == "unit" || key == "service")
                        return "service";
                    return key;
                };
                s = item.split(/:(.*)/);
                if (s.length >= 2 && well_know_keys.includes(s[0])) {
                    new_items[map_keys(s[0])] = s[1];
                    return false;
                }

                return true;
            });
    new_items.grep = values.join(" ");
    return new_items;
};
