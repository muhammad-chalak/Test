import {BrowserRouter,Routes,Route} from 'react-router-dom';
import Home from './pages/Home';
import History from './pages/History';
import Scholars from './pages/Scholars';
import Books from './pages/Books';
import Header from './components/Header';
import Footer from './components/Footer';

export default function App(){
return (
<BrowserRouter>
<Header/>
<Routes>
<Route path="/" element={<Home/>}/>
<Route path="/history" element={<History/>}/>
<Route path="/scholars" element={<Scholars/>}/>
<Route path="/books" element={<Books/>}/>
</Routes>
<Footer/>
</BrowserRouter>
);
}