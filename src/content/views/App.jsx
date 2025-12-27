import { Popover } from '@heroui/react';
import { IconTool } from '@tabler/icons-react';
import Counter from '@/components/Counter';
import './App.css';

function App() {
	// const [show, setShow] = useState(false);
	// const toggle = () => setShow(!show);
	return (
		// <div className='popup-container'>
		// 	{show && (
		// 		<div className={`popup-content ${show ? 'opacity-100' : 'opacity-0'}`}>
		// 			<h1>HELLO CRXJS</h1>
		// 			{/* <Counter msg='Vite + React + CRXJS' /> */}
		// 		</div>
		// 	)}
		// 	<button className='toggle-button' onClick={toggle}>
		// 		<img src={Logo} alt='CRXJS logo' className='button-icon' width={50} />
		// 	</button>
		// </div>
		<div className='popup-container'>
			<Popover className='flex-auto'>
				<Popover.Trigger className='flex-auto'>
					<IconTool size={40} />
				</Popover.Trigger>
				<Popover.Content>
					<Popover.Dialog>
						<Popover.Arrow />
						<Popover.Heading>Toolkit</Popover.Heading>
						<h1>HELLO CRXJS</h1>
						<Counter msg='Vite + React + CRXJS' />
					</Popover.Dialog>
				</Popover.Content>
			</Popover>
		</div>
	);
}

export default App;
