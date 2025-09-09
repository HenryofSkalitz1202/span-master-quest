import { useState, useEffect } from "react";

export const useSpeechSynthesis = () => {
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isSupported, setIsSupported] = useState(false);

    const speak = (text: string, voiceId: string) => {
        if (!isSupported || isSpeaking) return;

        const utterance = new SpeechSynthesisUtterance(text);
        const selectedVoice = voices.find(v => v.name === voiceId);

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
    };

    const stop = () => {
        if (!isSupported) return;
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    };

    useEffect(() => {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
            setIsSupported(true);

            const loadVoices = () => {
                const availableVoices = window.speechSynthesis.getVoices();
                if (availableVoices.length > 0) {
                    setVoices(availableVoices);
                }
            };

            // Voices are loaded asynchronously
            window.speechSynthesis.onvoiceschanged = loadVoices;
            loadVoices(); // Initial call
        }
    }, []);

    return { isSupported, isSpeaking, voices, speak, stop };
};