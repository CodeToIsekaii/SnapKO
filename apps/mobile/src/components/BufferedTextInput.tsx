import React, { useEffect, useRef, useState } from "react";
import { TextInput, type TextInputProps } from "react-native";

type BufferedTextInputProps = Omit<TextInputProps, "value" | "onChangeText"> & {
  value: string;
  onCommitText: (value: string) => void;
  commitDelayMs?: number;
};

export const BufferedTextInput = React.memo(function BufferedTextInput({
  value,
  onCommitText,
  commitDelayMs = 450,
  onBlur,
  onSubmitEditing,
  ...props
}: BufferedTextInputProps) {
  const [draft, setDraft] = useState(value);
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    if (value !== lastCommittedRef.current) {
      lastCommittedRef.current = value;
      setDraft(value);
    }
  }, [value]);

  const commit = React.useCallback(() => {
    if (draft === lastCommittedRef.current) return;
    lastCommittedRef.current = draft;
    onCommitText(draft);
  }, [draft, onCommitText]);

  useEffect(() => {
    const timer = setTimeout(commit, commitDelayMs);
    return () => clearTimeout(timer);
  }, [commit, commitDelayMs]);

  return (
    <TextInput
      {...props}
      value={draft}
      onChangeText={setDraft}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      onSubmitEditing={(event) => {
        commit();
        onSubmitEditing?.(event);
      }}
    />
  );
});
