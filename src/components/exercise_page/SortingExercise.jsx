import {
    DndContext,
    DragOverlay,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    horizontalListSortingStrategy,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import he from "he";
import _ from "lodash";
import PropTypes from "prop-types";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LiaCheckCircle, LiaChevronCircleRightSolid, LiaTimesCircle } from "react-icons/lia";
import { ShuffleArray } from "../../utils/ShuffleArray";
import useCountdownTimer from "../../utils/useCountdownTimer";
import SortableWord from "./SortableWord";

const SortingExercise = ({
    quiz,
    onAnswer,
    onQuit,
    useHorizontalStrategy = false,
    timer,
    setTimeIsUp,
}) => {
    const [currentQuestionIndex, setcurrentQuestionIndex] = useState(0);
    const [itemsLeft, setItemsLeft] = useState([]);
    const [itemsRight, setItemsRight] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [buttonsDisabled, setButtonsDisabled] = useState(false);
    const [currentTableHeading, setCurrentTableHeading] = useState([]);
    const [shuffledQuiz, setShuffledQuiz] = useState([]);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    const { formatTime, clearTimer, startTimer } = useCountdownTimer(timer, () =>
        setTimeIsUp(true)
    );

    const { t } = useTranslation();

    useEffect(() => {
        if (timer > 0) {
            startTimer();
        }
    }, [timer, startTimer]);

    const sensors = useSensors(useSensor(PointerSensor));

    const filterAndShuffleQuiz = useCallback((quiz) => {
        const uniqueQuiz = _.uniqWith(quiz, _.isEqual);
        return ShuffleArray(uniqueQuiz);
    }, []);

    const generateUniqueItems = (items) => {
        return items.map((item, index) => ({
            ...item,
            id: `${item.value}-${index}-${Math.random().toString(36).substring(2, 11)}`,
        }));
    };

    const loadQuiz = useCallback((quizData) => {
        const shuffledOptions = ShuffleArray([...quizData.rowOptions]);
        const uniqueItems = generateUniqueItems(shuffledOptions);

        const halfwayPoint = Math.ceil(uniqueItems.length / 2);
        const itemsLeft = uniqueItems.slice(0, halfwayPoint);
        const itemsRight = uniqueItems.slice(halfwayPoint);

        setItemsLeft(itemsLeft);
        setItemsRight(itemsRight);
        setCurrentTableHeading(quizData.tableHeading);
        setButtonsDisabled(false);
        setHasSubmitted(false); // Reset submission status for each quiz
    }, []);

    useEffect(() => {
        if (quiz && quiz.length > 0) {
            const uniqueShuffledQuiz = filterAndShuffleQuiz(quiz); // Ensure uniqueness and shuffle
            setShuffledQuiz(uniqueShuffledQuiz);
            setcurrentQuestionIndex(0); // Reset currentQuestionIndex to 0
        }
    }, [quiz, filterAndShuffleQuiz]);

    useEffect(() => {
        if (shuffledQuiz.length > 0 && currentQuestionIndex < shuffledQuiz.length) {
            loadQuiz(shuffledQuiz[currentQuestionIndex]);
        }
    }, [shuffledQuiz, currentQuestionIndex, loadQuiz]);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over) {
            setActiveId(null);
            return;
        }

        if (active.id !== over.id) {
            // Find the active item
            const activeItem =
                itemsLeft.find((item) => item.id === active.id) ||
                itemsRight.find((item) => item.id === active.id);

            if (!activeItem) return;

            // Determine if the item is moving between columns
            if (itemsLeft.some((item) => item.id === active.id)) {
                // Moving from left to right
                if (itemsRight.some((item) => item.id === over.id) || itemsRight.length === 0) {
                    setItemsLeft((prev) => prev.filter((item) => item.id !== active.id));
                    setItemsRight((prev) => [...prev, activeItem]);
                } else {
                    const oldIndex = itemsLeft.findIndex((item) => item.id === active.id);
                    const newIndex = itemsLeft.findIndex((item) => item.id === over.id);
                    setItemsLeft((prev) => arrayMove(prev, oldIndex, newIndex));
                }
            } else if (itemsRight.some((item) => item.id === active.id)) {
                // Moving from right to left
                if (itemsLeft.some((item) => item.id === over.id) || itemsLeft.length === 0) {
                    setItemsRight((prev) => prev.filter((item) => item.id !== active.id));
                    setItemsLeft((prev) => [...prev, activeItem]);
                } else {
                    const oldIndex = itemsRight.findIndex((item) => item.id === active.id);
                    const newIndex = itemsRight.findIndex((item) => item.id === over.id);
                    setItemsRight((prev) => arrayMove(prev, oldIndex, newIndex));
                }
            }
        }

        setActiveId(null);
    };

    const handleSubmit = () => {
        const allItems = [...itemsLeft, ...itemsRight];
        let correctCount = 0;

        allItems.forEach((item) => {
            const expectedColumn = item.columnPos;
            const actualColumn = itemsLeft.includes(item) ? 1 : 2;
            if (expectedColumn === actualColumn) {
                correctCount++;
            }
        });

        setButtonsDisabled(true);
        setHasSubmitted(true); // Mark the answers as submitted
        onAnswer(correctCount, "multiple", allItems.length);
    };

    const handleNextQuiz = () => {
        if (currentQuestionIndex < shuffledQuiz.length - 1) {
            setcurrentQuestionIndex((prevIndex) => prevIndex + 1);
        } else {
            onQuit();
            clearTimer();
        }
    };

    const handleQuit = () => {
        onQuit();
        clearTimer();
    };

    const sortableStrategy = useHorizontalStrategy
        ? horizontalListSortingStrategy
        : verticalListSortingStrategy;

    const SortableColumn = ({
        items,
        heading,
        columnPos,
        sortableStrategy,
        hasSubmitted,
        buttonsDisabled,
        t,
    }) => (
        <div className="w-full justify-center lg:w-4/5 xl:w-3/5">
            <div className="text-center font-semibold">
                {heading && (
                    <span
                        lang="en"
                        dangerouslySetInnerHTML={{
                            __html: he.decode(heading.text),
                        }}
                    />
                )}
            </div>
            <div className="divider divider-accent mt-0 mb-2"></div>
            <div className="flex flex-col items-center gap-4">
                <SortableContext items={items} strategy={sortableStrategy}>
                    {items.length > 0 ? (
                        items.map((item) => (
                            <SortableWord
                                key={item.id}
                                item={item}
                                isCorrect={hasSubmitted ? item.columnPos === columnPos : null}
                                disabled={buttonsDisabled}
                            />
                        ))
                    ) : (
                        <div className="w-full p-4 text-center">
                            <div className="text-secondary rounded-xs border p-4">
                                {t("exercise_page.dropLayer")}
                            </div>
                        </div>
                    )}
                </SortableContext>
            </div>
        </div>
    );

    SortingExercise.propTypes = {
        quiz: PropTypes.arrayOf(PropTypes.object).isRequired,
        onAnswer: PropTypes.func.isRequired,
        onQuit: PropTypes.func.isRequired,
        useHorizontalStrategy: PropTypes.bool,
        timer: PropTypes.number.isRequired,
        setTimeIsUp: PropTypes.func.isRequired,
    };

    SortableColumn.propTypes = {
        items: PropTypes.arrayOf(PropTypes.object).isRequired,
        heading: PropTypes.object,
        columnPos: PropTypes.number.isRequired,
        sortableStrategy: PropTypes.func.isRequired,
        hasSubmitted: PropTypes.bool.isRequired,
        buttonsDisabled: PropTypes.bool.isRequired,
        t: PropTypes.func.isRequired,
    };

    return (
        <>
            <div className="card-body">
                <div className="text-lg font-semibold">
                    {timer > 0 ? (
                        <div className="flex items-center">
                            <div className="flex-1 md:flex-none">
                                {t("exercise_page.questionNo")} #{currentQuestionIndex + 1}
                            </div>
                            <div className="ms-auto flex justify-end">
                                {t("exercise_page.timer")} {formatTime()}
                            </div>
                        </div>
                    ) : (
                        <p>
                            {t("exercise_page.questionNo")} #{currentQuestionIndex + 1}
                        </p>
                    )}
                </div>
                <div className="divider divider-secondary m-0"></div>

                <div className="my-3 flex flex-row justify-center gap-2 md:gap-6">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        {[itemsLeft, itemsRight].map((items, index) => (
                            <SortableColumn
                                key={index}
                                items={items}
                                heading={currentTableHeading[index]}
                                columnPos={index + 1}
                                sortableStrategy={sortableStrategy}
                                hasSubmitted={hasSubmitted}
                                buttonsDisabled={buttonsDisabled}
                                t={t}
                            />
                        ))}

                        <DragOverlay>
                            {activeId ? (
                                <SortableWord
                                    item={itemsLeft
                                        .concat(itemsRight)
                                        .find((item) => item.id === activeId)}
                                    isOverlay
                                />
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>

                <div className="card-actions justify-center">
                    <div className="my-3 flex flex-wrap justify-center gap-2">
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={buttonsDisabled}
                            onClick={handleSubmit}
                        >
                            <LiaCheckCircle className="h-6 w-6" />{" "}
                            {t("exercise_page.buttons.checkBtn")}
                        </button>
                        {currentQuestionIndex < shuffledQuiz.length - 1 && (
                            <button
                                type="button"
                                className="btn btn-accent"
                                onClick={handleNextQuiz}
                            >
                                <LiaChevronCircleRightSolid className="h-6 w-6" />{" "}
                                {t("exercise_page.buttons.nextBtn")}
                            </button>
                        )}
                        <button type="button" className="btn btn-error" onClick={handleQuit}>
                            <LiaTimesCircle className="h-6 w-6" />{" "}
                            {t("exercise_page.buttons.quitBtn")}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default SortingExercise;
