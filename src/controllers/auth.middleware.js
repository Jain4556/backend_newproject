import { asyncHandler } from "../utils/asyncHandler";

export const verifyJWT = asyncHandler(async (req, _, next) => {
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer", "")

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

        const user = await User.findById(decodedToken?._id).select
            ("-password -refreshToken")

        if (!user) {
            throw new ApiError(401, "Invalid access token")
        }


        req.user = user;
        next()
    } catch (error) {
        throw new ApiError(401, error?.messsage || "Invalid access token")
    }



})