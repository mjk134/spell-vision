import { motion } from "motion/react";

interface StatbarProps {
    progress: number;
    totalProgress: number;
}

export default function Statbar({
    progress,
    totalProgress
}: StatbarProps) {

    return (
        <div className="border-solid border-2 p-1 border-gray-200 w-full h-full">
            <motion.div initial={{width: 0}} animate={{ width: `${progress/totalProgress*100}%`}} className="bg-gray-200 w-full h-full" />
        </div>
    )
}