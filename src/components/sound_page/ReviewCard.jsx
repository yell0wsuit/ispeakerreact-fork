import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import {
    BsEmojiFrown,
    BsEmojiFrownFill,
    BsEmojiNeutral,
    BsEmojiNeutralFill,
    BsEmojiSmile,
    BsEmojiSmileFill,
} from "react-icons/bs";
import { sonnerSuccessToast, sonnerWarningToast } from "../../utils/sonnerCustomToast";
import { Trans } from "react-i18next";
import he from "he";
import { checkRecordingExists } from "../../utils/databaseOperations";

const ReviewCard = ({ sound, accent, t, onReviewUpdate }) => {
    const [review, setReview] = useState(null);
    const [hasRecording, setHasRecording] = useState(false);

    // Load review from localStorage on mount
    useEffect(() => {
        const storedData = JSON.parse(localStorage.getItem("ispeaker")) || {};
        const soundReview = storedData.soundReview?.[accent]?.[`${sound.type}${sound.id}`] || null;
        setReview(soundReview);
    }, [accent, sound]);

    // Check if recording exists
    useEffect(() => {
        const checkRecording = async () => {
            const recordingKey = `${sound.type === "consonants" ? "constant" : sound.type === "vowels" ? "vowel" : "dipthong"}-${accent}-${sound.id}-0`;
            const exists = await checkRecordingExists(recordingKey);
            setHasRecording(exists);
        };
        checkRecording();
    }, [accent, sound]);

    const handleReviewClick = (type) => {
        if (!hasRecording) {
            sonnerWarningToast(t("toast.noRecording"));
            return;
        }

        const storedData = JSON.parse(localStorage.getItem("ispeaker")) || {};
        storedData.soundReview = storedData.soundReview || {};
        storedData.soundReview[accent] = storedData.soundReview[accent] || {};
        storedData.soundReview[accent][`${sound.type}${sound.id}`] = type;

        localStorage.setItem("ispeaker", JSON.stringify(storedData));
        setReview(type);

        sonnerSuccessToast(t("toast.reviewUpdated"));

        if (onReviewUpdate) {
            onReviewUpdate();
        }
    };

    const emojiStyle = (reviewType) => {
        const styles = {
            good: "text-success",
            neutral: "text-warning",
            bad: "text-error",
        };
        return review === reviewType ? styles[reviewType] : "";
    };

    return (
        <div className="card card-lg card-border flex h-auto flex-col justify-between pb-6 shadow-md dark:border-slate-600">
            <div className="card-body">
                <p className="mb-2 text-center">
                    <Trans
                        i18nKey="sound_page.reviewInstructions"
                        values={{ phoneme: he.decode(sound.phoneme) }}
                    >
                        <span lang="en">{he.decode(sound.phoneme)}</span>?
                    </Trans>
                </p>
                <div className="flex flex-row items-center justify-center space-x-4">
                    <a
                        onClick={() => handleReviewClick("good")}
                        className="cursor-pointer"
                        role="button"
                    >
                        {review === "good" ? (
                            <BsEmojiSmileFill size={52} className={emojiStyle("good")} />
                        ) : (
                            <BsEmojiSmile size={52} className={emojiStyle("good")} />
                        )}
                    </a>
                    <a
                        onClick={() => handleReviewClick("neutral")}
                        className="cursor-pointer"
                        role="button"
                    >
                        {review === "neutral" ? (
                            <BsEmojiNeutralFill size={52} className={emojiStyle("neutral")} />
                        ) : (
                            <BsEmojiNeutral size={52} className={emojiStyle("neutral")} />
                        )}
                    </a>
                    <a
                        onClick={() => handleReviewClick("bad")}
                        className="cursor-pointer"
                        role="button"
                    >
                        {review === "bad" ? (
                            <BsEmojiFrownFill size={52} className={emojiStyle("bad")} />
                        ) : (
                            <BsEmojiFrown size={52} className={emojiStyle("bad")} />
                        )}
                    </a>
                </div>
            </div>
        </div>
    );
};

ReviewCard.propTypes = {
    sound: PropTypes.shape({
        phoneme: PropTypes.string.isRequired,
        id: PropTypes.number.isRequired,
        type: PropTypes.oneOf(["consonants", "vowels", "diphthongs"]).isRequired,
    }).isRequired,
    accent: PropTypes.oneOf(["british", "american"]).isRequired,
    t: PropTypes.func.isRequired,
    onReviewUpdate: PropTypes.func,
};

export default ReviewCard;
