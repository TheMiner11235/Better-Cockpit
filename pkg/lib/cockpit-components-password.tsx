/*
 * Copyright (C) 2020 Red Hat, Inc.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */
import cockpit from 'cockpit';
import React, { useEffect, useRef, useState } from 'react';
import { debounce } from 'throttle-debounce';
import { Button } from '@patternfly/react-core/dist/esm/components/Button/index.js';
import { FormGroup, FormHelperText } from "@patternfly/react-core/dist/esm/components/Form/index.js";
import { InputGroup, InputGroupItem } from '@patternfly/react-core/dist/esm/components/InputGroup/index.js';
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover/index.js";
import { Progress, ProgressMeasureLocation, ProgressSize, type ProgressProps } from "@patternfly/react-core/dist/esm/components/Progress/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { EyeIcon, EyeSlashIcon, HelpIcon } from '@patternfly/react-icons';
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";

import { FormHelper } from "cockpit-components-form-helper";

import './cockpit-components-password.scss';

const _ = cockpit.gettext;

interface PasswordQuality {
    value: number;
    message?: string | undefined;
}

export function password_quality(password: string, force?: boolean): Promise<PasswordQuality> {
    return new Promise((resolve, reject) => {
        cockpit.spawn(['/usr/bin/pwscore'], { err: "message" })
                .input(password)
                .done(function(content) {
                    const quality = parseInt(content, 10);
                    if (quality === 0 && !force)
                        reject(new Error(_("Password is too weak")));
                    else
                        resolve({ value: quality, message: quality === 100 ? _("Excellent password") : undefined });
                })
                .fail(function(ex) {
                    if (!force)
                        reject(new Error(ex.message || _("Password is not acceptable")));
                    else
                        resolve({ value: 0 });
                });
    });
}

const debounced_password_quality = debounce(300, (value: string, callback: (quality: PasswordQuality) => void) => {
    password_quality(value).catch(() => ({ value: 0 })).then(callback);
});

interface RawPasswordQuality {
    ok: boolean;
    value: number;
}

// Unlike password_quality() this does not reject for weak passwords, and it
// reports whether pwscore was actually usable.  This lets callers hide the
// strength meter entirely when pwscore is not installed instead of always
// claiming that a password is weak.
const debounced_raw_password_quality = debounce(300, (value: string, callback: (quality: RawPasswordQuality) => void) => {
    cockpit.spawn(['/usr/bin/pwscore'], { err: "message" })
            .input(value)
            .done(content => callback({ ok: true, value: parseInt(content, 10) }))
            .fail(() => callback({ ok: false, value: 0 }));
});

export const PasswordFormFields = ({
    password_label, password_confirm_label,
    password_label_info,
    initial_password,
    error_password, error_password_confirm,
    idPrefix, change
}: {
    password_label: string,
    password_confirm_label?: string,
    password_label_info?: string,
    initial_password?: string,
    error_password?: string | undefined,
    error_password_confirm?: string | undefined,
    idPrefix: string,
    change: (field: "password" | "password_confirm", value: string) => void,
}) => {
    const [password, setPassword] = useState(initial_password || "");
    const [passwordConfirm, setConfirmPassword] = useState("");
    const [passwordStrength, setPasswordStrength] = useState<number>(-1);
    const [passwordMessage, setPasswordMessage] = useState<string | undefined>("");
    const [passwordHidden, setPasswordHidden] = useState(true);
    const [passwordConfirmHidden, setPasswordConfirmHidden] = useState(true);

    function onPasswordChanged(value: string) {
        setPassword(value);
        change("password", value);

        if (value) {
            debounced_password_quality(value, (strength: PasswordQuality) => {
                setPasswordStrength(strength.value);
                setPasswordMessage(strength.message);
            });
        } else {
            setPasswordStrength(-1);
            setPasswordMessage("");
        }
    }

    let variant: ProgressProps['variant'];
    let message;
    let messageColor;
    if (passwordStrength > 66) {
        variant = "success";
        messageColor = "pf-v6-u-success-color-200";
        message = _("Strong password");
    } else if (passwordStrength > 33) {
        variant = "warning";
        messageColor = "pf-v6-u-warning-color-200";
        message = _("Acceptable password");
    } else {
        variant = "danger";
        messageColor = "pf-v6-u-danger-color-200";
        message = _("Weak password");
    }

    if (!passwordMessage && message)
        setPasswordMessage(message);

    let passwordStrengthValue = passwordStrength;
    if (password !== "" && (passwordStrengthValue >= 0 && passwordStrengthValue < 25))
        passwordStrengthValue = 25;

    return (
        <>
            <FormGroup label={password_label}
                {...password_label_info && {
                    labelHelp: <Popover bodyContent={password_label_info}>
                        <Button icon={<HelpIcon />} id={`${password_label}-help-popup-button`} variant="plain" aria-label="Help" />
                    </Popover>
                }}
                       id={idPrefix + "-pw1-group"}
                       fieldId={idPrefix + "-pw1"}>
                <InputGroup>
                    <InputGroupItem isFill>
                        <TextInput className="check-passwords" type={passwordHidden ? "password" : "text"} id={idPrefix + "-pw1"}
                                   autoComplete="new-password" value={password} onChange={(_event, value) => onPasswordChanged(value)}
                                   validated={error_password ? "warning" : "default"} />
                    </InputGroupItem>
                    <InputGroupItem>
                        <Button
                            variant="control"
                            onClick={() => setPasswordHidden(!passwordHidden)}
                            aria-label={passwordHidden ? _("Show password") : _("Hide password")}>
                            {passwordHidden ? <EyeIcon /> : <EyeSlashIcon />}
                        </Button>
                    </InputGroupItem>
                </InputGroup>
                {passwordStrengthValue >= 0 && <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                    <FlexItem>
                        <Progress id={idPrefix + "-meter"}
                            className={"pf-v6-u-pt-xs ct-password-strength-meter " + variant}
                            title={_("password quality")}
                            size={ProgressSize.sm}
                            measureLocation={ProgressMeasureLocation.none}
                            variant={variant}
                            value={passwordStrengthValue} />
                    </FlexItem>
                    <FlexItem>
                        <div id={idPrefix + "-password-meter-message"} className={"pf-v6-c-form__helper-text " + messageColor} aria-live="polite">{passwordMessage}</div>
                    </FlexItem>
                </Flex>}
                {error_password && <FormHelperText>
                    <HelperText component="ul" aria-live="polite" id="password-error-message">
                        <HelperTextItem variant="warning" component="li">
                            {error_password}
                        </HelperTextItem>
                    </HelperText>
                </FormHelperText>}
            </FormGroup>

            {password_confirm_label && <FormGroup label={password_confirm_label}
                       id={idPrefix + "-pw2-group"}
                       fieldId={idPrefix + "-pw2"}>
                <InputGroup>
                    <InputGroupItem isFill>
                        <TextInput type={passwordConfirmHidden ? "password" : "text"} id={idPrefix + "-pw2"} autoComplete="new-password"
                            value={passwordConfirm} onChange={(_event, value) => { setConfirmPassword(value); change("password_confirm", value) }} />
                    </InputGroupItem>
                    <InputGroupItem>
                        <Button
                            variant="control"
                            onClick={() => setPasswordConfirmHidden(!passwordConfirmHidden)}
                            aria-label={passwordConfirmHidden ? _("Show confirmation password") : _("Hide confirmation password")}>
                            {passwordConfirmHidden ? <EyeIcon /> : <EyeSlashIcon />}
                        </Button>
                    </InputGroupItem>
                </InputGroup>
                <FormHelper fieldId={idPrefix + "-pw2"} helperTextInvalid={error_password_confirm} />
            </FormGroup>}
        </>
    );
};

// A standalone password strength meter, e.g. for passphrase fields that are not
// part of a full PasswordFormFields setup (such as storage's LUKS dialogs).
// It hides itself when pwscore is not available so that it never reports a
// misleading "Weak" result.
export const PasswordStrength = ({ password, idPrefix }: {
    password: string,
    idPrefix: string,
}) => {
    const [quality, setQuality] = useState<RawPasswordQuality>({ ok: true, value: -1 });
    const passwordRef = useRef(password);
    passwordRef.current = password;

    useEffect(() => {
        if (!password) {
            setQuality({ ok: true, value: -1 });
            return;
        }
        debounced_raw_password_quality(password, q => {
            // Ignore results for a password that has since changed
            if (passwordRef.current === password)
                setQuality(q);
        });
    }, [password]);

    if (!quality.ok || quality.value < 0)
        return null;

    let variant: ProgressProps['variant'];
    let messageColor;
    let message;
    if (quality.value > 66) {
        variant = "success";
        messageColor = "pf-v6-u-success-color-200";
        message = _("Strong password");
    } else if (quality.value > 33) {
        variant = "warning";
        messageColor = "pf-v6-u-warning-color-200";
        message = _("Acceptable password");
    } else {
        variant = "danger";
        messageColor = "pf-v6-u-danger-color-200";
        message = _("Weak password");
    }
    if (quality.value === 100)
        message = _("Excellent password");

    let value = quality.value;
    if (value < 25)
        value = 25;

    return (
        <Flex spaceItems={{ default: 'spaceItemsSm' }}>
            <FlexItem>
                <Progress id={idPrefix + "-meter"}
                    className={"pf-v6-u-pt-xs ct-password-strength-meter " + variant}
                    title={_("password quality")}
                    size={ProgressSize.sm}
                    measureLocation={ProgressMeasureLocation.none}
                    variant={variant}
                    value={value} />
            </FlexItem>
            <FlexItem>
                <div id={idPrefix + "-password-meter-message"} className={"pf-v6-c-form__helper-text " + messageColor} aria-live="polite">{message}</div>
            </FlexItem>
        </Flex>
    );
};
