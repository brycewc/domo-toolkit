import Logo from '@/assets/crx.svg';
import { useState } from 'react';
import './App.css';
import HelloWorld from '@/components/HelloWorld';

function App() {
	const [show, setShow] = useState(false);
	const toggle = () => setShow(!show);

	return (
		<div className='popup-container'>
			{show && (
				<div className={`popup-content ${show ? 'opacity-100' : 'opacity-0'}`}>
					<h1>HELLO CRXJS</h1>
					<HelloWorld msg='Vite + React + CRXJS' />
				</div>
			)}
			<button className='toggle-button' onClick={toggle}>
				<img src={Logo} alt='CRXJS logo' className='button-icon' width={50} />
			</button>
		</div>
	);
}

export default App;
