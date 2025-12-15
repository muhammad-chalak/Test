import {Link} from 'react-router-dom';
export default function Header(){
return (
<header>
<Link to="/">ماڵەوە</Link>
<Link to="/history">مێژوو</Link>
<Link to="/scholars">زانایان</Link>
<Link to="/books">کتێب</Link>
</header>
);
}