import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { HabitCard } from './HabitCard.jsx';

export function HabitSortableItem({ habit, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: habit.id,
    data: {
      type: 'habit',
      habit
    }
  });

  let transformString = CSS.Transform.toString(transform);
  if (isDragging && transformString) {
    transformString += " scale(1.02)";
  } else if (isDragging) {
    transformString = "scale(1.02)";
  }

  const style = {
    transform: transformString,
    transition: isDragging ? "none" : (transition || "transform 200ms cubic-bezier(0.2, 0, 0, 1)"),
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 100 : 'auto',
    position: 'relative',
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.5)" : "none"
  };



  return (
    <div ref={setNodeRef} style={style}>
      <HabitCard 
        habit={habit} 
        dragHandleProps={{ ...attributes, ...listeners }}
        {...props} 
      />
    </div>
  );
}
