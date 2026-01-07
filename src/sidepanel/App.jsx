import { useTheme } from '@/hooks';
import './App.css';

export default function App() {
	// Apply theme
	useTheme();

	return <div className='bg-background'></div>;
}
