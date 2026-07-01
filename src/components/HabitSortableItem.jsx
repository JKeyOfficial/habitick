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

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.1 : 1,
    zIndex: isDragging ? 100 : 'auto',
    position: 'relative',
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box"
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
