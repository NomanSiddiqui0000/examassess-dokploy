import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserLayout from '../../components/Layout/UserLayout';
import api from '../../utils/api';
import { DEFAULT_QUESTION_DIFFICULTY } from '../../constants/questionDifficulty';

interface BookmarkItem {
    _id: string;
    questionText: string;
    options: string[];
    correctAnswer: number;
    category: string;
    difficulty?: string;
    createdAt: string;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

const Bookmarks: React.FC = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState<BookmarkItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [difficulties, setDifficulties] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [minutes, setMinutes] = useState<number | ''>(15);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadBookmarks = () => {
        setLoading(true);
        setError('');
        const query = new URLSearchParams({ page: String(page), limit: '8' });
        if (search) query.set('search', search);
        if (category) query.set('category', category);
        if (difficulty) query.set('difficulty', difficulty);
        api.get(`/user/bookmarks?${query.toString()}`)
            .then((res) => {
                setItems(res.data.items || []);
                setCategories(res.data.categories || []);
                setDifficulties(res.data.difficulties || []);
                setPages(res.data.pages || 1);
                setTotal(res.data.total || 0);
            })
            .catch((err) => setError(err.response?.data?.message || 'Could not load bookmarks. Please try again.'))
            .finally(() => setLoading(false));
    };

    useEffect(loadBookmarks, [page, search, category, difficulty]);

    const removeBookmark = async (id: string) => {
        try {
            setError('');
            await api.delete(`/user/bookmarks/${id}`);
            loadBookmarks();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Could not remove bookmark. Please try again.');
        }
    };

    const startPractice = () => {
        if (minutes === '') {
            alert('Please enter a valid practice duration in minutes.');
            return;
        }
        navigate(`/user/quiz/personal-practice?type=personal&source=bookmarks&minutes=${minutes}`);
    };

    return (
        <UserLayout>
            <div className="learning-page">
                <section className="learning-hero">
                    <div>
                        <p className="learning-kicker">Personal Learning</p>
                        <h1>Bookmarks</h1>
                        <p>Review important questions you saved from quiz and assessment reviews.</p>
                    </div>
                    <div className="learning-practice-box">
                        <label>Practice timer</label>
                        <div>
                            <input type="number" min={1} max={180} value={minutes} onChange={(event) => setMinutes(event.target.value === '' ? '' : Number(event.target.value))} />
                            <span>minutes</span>
                        </div>
                        <button className="btn btn-accent" disabled={total === 0} onClick={startPractice}>Practice From Bookmarks</button>
                    </div>
                </section>

                <section className="learning-filters card">
                    <input className="form-input" placeholder="Search bookmarked questions..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
                    <select className="form-select" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
                        <option value="">All Categories</option>
                        {categories.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                    <select className="form-select" value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setPage(1); }}>
                        <option value="">All Difficulties</option>
                        {difficulties.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                </section>

                {error && <div className="alert alert-error">{error}</div>}

                {loading ? (
                    <div className="loading-overlay"><div className="loading-spinner" />Loading bookmarks...</div>
                ) : items.length === 0 ? (
                    <div className="learning-empty card">No bookmarked questions found.</div>
                ) : (
                    <div className="learning-card-grid">
                        {items.map((item) => (
                            <article className="learning-question-card" key={item._id}>
                                <div className="learning-card-header">
                                    <span>{item.category}</span>
                                    <span>{item.difficulty || DEFAULT_QUESTION_DIFFICULTY}</span>
                                </div>
                                <h3>{item.questionText}</h3>
                                <div className="learning-options">
                                    {item.options.map((option, index) => (
                                        <div className={index === item.correctAnswer ? 'correct' : ''} key={`${item._id}-${index}`}>
                                            <strong>{OPTION_LETTERS[index]}</strong>
                                            <span>{option}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="learning-card-footer">
                                    <span>Added {new Date(item.createdAt).toLocaleDateString()}</span>
                                    <button className="btn btn-secondary btn-sm" onClick={() => removeBookmark(item._id)}>Remove Bookmark</button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                <div className="learning-pagination">
                    <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                    <span>Page {page} of {pages}</span>
                    <button className="btn btn-secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button>
                </div>
            </div>
        </UserLayout>
    );
};

export default Bookmarks;
