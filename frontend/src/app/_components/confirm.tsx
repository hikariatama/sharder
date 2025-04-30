import { motion } from 'framer-motion';

interface ConfirmProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function Confirm({ message, onConfirm, onCancel }: ConfirmProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/5 backdrop-blur-lg bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-black border-1 border-red-500 p-6 rounded-xl shadow-lg w-11/12 max-w-md">
        <p className="mb-4 text-white text-center">{message}</p>
        <div className="flex justify-end space-x-4">
          <motion.button
            onClick={handleConfirm}
            className="px-4 py-1 border-1 border-red-500 text-white rounded-lg hover:bg-red-500 cursor-pointer transition-colors duration-150"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 700, damping: 20 }}
          >
            Confirm
          </motion.button>
          <motion.button
            onClick={handleCancel}
            className="px-4 py-1 text-white rounded-lg hover:border-zinc-400 border-1 border-transparent cursor-pointer transition-colors duration-150"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 700, damping: 20 }}
          >
            Cancel
          </motion.button>
        </div>
      </div>
    </div>
  );
}
