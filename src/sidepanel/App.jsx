import crxLogo from '@/assets/crx.svg';
import reactLogo from '@/assets/react.svg';
import viteLogo from '@/assets/vite.svg';
import Counter from '@/components/Counter';
import { useTheme } from '@/hooks/useTheme';
import './App.css';

export default function App() {
	// Apply theme
	useTheme();

	return (
		<div>
			<a href='https://vite.dev' target='_blank' rel='noreferrer'>
				<img src={viteLogo} className='logo' alt='Vite logo' />
			</a>
			<a href='https://reactjs.org/' target='_blank' rel='noreferrer'>
				<img src={reactLogo} className='logo react' alt='React logo' />
			</a>
			<a href='https://crxjs.dev/vite-plugin' target='_blank' rel='noreferrer'>
				<img src={crxLogo} className='logo crx' alt='crx logo' />
			</a>
			<Counter msg='Vite + React + CRXJS' />
		</div>
	);
}
