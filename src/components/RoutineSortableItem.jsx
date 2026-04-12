import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RoutineCard } from './RoutineCard.jsx';

export function RoutineSortableItem({ routine, routineHabits, widthFactor, flexBasis, today, shieldedDates, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: routine.id });

  let transformString = CSS.Transform.toString(transform);
  if (isDragging && transformString) {
    transformString += " scale(1.02)";
  } else if (isDragging) {
    transformString = "scale(1.02)";
  }

  const style = {
    transform: transformString,
    transition: transition || "transform 250ms cubic-bezier(0.2, 0, 0, 1)",
    flex: widthFactor === 3 ? "1 1 100%" : `1 1 ${flexBasis}`,
    maxWidth: widthFactor === 3 ? "100%" : flexBasis,
    minWidth: widthFactor === 3 ? "100%" : "300px",
    position: "relative",
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.9 : 1,
    boxShadow: isDragging ? "0 10px 30px rgba(0,0,0,0.5)" : "none",
  };

  return (
    <div ref={setNodeRef} style={style} className="ht-routine-reorder-item">
      <RoutineCard
        routine={routine}
        habits={routineHabits}
        today={today}
        dragHandleProps={{ ...attributes, ...listeners }}
        {...props}
      />
    </div>
  );
}