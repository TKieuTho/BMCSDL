const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.VAITRO !== 'ADMIN') {
        return res.status(403).render('error', {
            message: 'Bạn không có quyền truy cập trang này',
            error: { status: 403 },
            BASE_URL: res.locals.BASE_URL
        });
    }
    next();
};

module.exports = {
    requireLogin,
    requireAdmin
}; 